-- ============================================================
-- 0017_landlord_payouts
-- ============================================================
-- Landlord earnings and withdrawals. The baseline schema already has the tables
-- (landlord_earnings, payouts, withdrawal_methods, payout_settings, platform_fee_settings);
-- this migration wires them up:
--
-- 1. platform_fee_settings.paymongo_fee_rate — the PayMongo transaction fee (%), editable by the
--    superadmin (PayMongo's QR Ph fee is 1.5%). fee_value stays the MyBalai platform fee (%).
-- 2. A trigger that records a landlord_earnings row the moment an ONLINE (PayMongo) payment turns
--    `paid`: the fees are SNAPSHOTTED at that moment, so changing a rate later never rewrites
--    history.   gross - PayMongo fee (processing_fee_amount) - platform fee (service_fee_amount) = net.
--    Payments a landlord verified by hand (GCash receipts) are NOT earnings here: that money never
--    passed through MyBalai.
--    Money becomes withdrawable `settlement_period_days` after the payment (PayMongo holds it first).
-- 3. request_landlord_payout(): atomically claims all withdrawable earnings into one payout
--    (refuses below the minimum threshold, or while another payout is still open).
--    The withdrawal DAY of the month is checked by the app (payout_settings.payout_day_1).
-- 4. Status columns: relaxed to the values the app uses (any old CHECK on them is replaced).
--
-- Idempotent — safe to re-run. Apply in the Supabase SQL editor.
-- ============================================================

begin;

-- ---- settings ---------------------------------------------------------------------
alter table public.platform_fee_settings
  add column if not exists paymongo_fee_rate numeric not null default 1.5;

-- ---- replace status CHECKs (unknown legacy values) with the app's ------------------
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in (
        'public.landlord_earnings'::regclass,
        'public.payouts'::regclass,
        'public.payout_settings'::regclass
      )
      and pg_get_constraintdef(c.oid) ~* '(status|frequency)'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.landlord_earnings
  add constraint landlord_earnings_status_check
  check (status in ('pending', 'in_payout', 'paid_out', 'reversed'));
alter table public.payouts
  add constraint payouts_status_check
  check (status in ('pending', 'processing', 'completed', 'failed'));

-- ---- earnings ------------------------------------------------------------------------
create unique index if not exists landlord_earnings_payment_key
  on public.landlord_earnings (payment_id);
create index if not exists landlord_earnings_landlord_idx
  on public.landlord_earnings (landlord_id, created_at desc);
create index if not exists payouts_landlord_idx
  on public.payouts (landlord_id, created_at desc);

create or replace function public.record_landlord_earning() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_paid_id   int;
  v_owner     bigint;
  v_type      text;
  v_plat      numeric;
  v_pm_rate   numeric;
  v_hold      int;
  v_gross     numeric;
  v_pm_fee    numeric;
  v_plat_fee  numeric;
  v_paid_at   timestamptz;
begin
  select payment_status_id into v_paid_id from payment_statuses where status_code = 'paid';
  if new.payment_status_id is distinct from v_paid_id then return new; end if;
  if new.paymongo_session_id is null or new.booking_id is null then return new; end if;

  select p.property_owner into v_owner
  from bookings b join properties p on p.property_id = b.property_id
  where b.booking_id = new.booking_id;
  if v_owner is null then return new; end if;

  select coalesce(fee_type, 'percentage'), coalesce(fee_value, 0), coalesce(paymongo_fee_rate, 0)
    into v_type, v_plat, v_pm_rate
  from platform_fee_settings where is_active order by fee_setting_id desc limit 1;
  if not found then v_type := 'percentage'; v_plat := 0; v_pm_rate := 0; end if;

  select coalesce(settlement_period_days, 3) into v_hold
  from payout_settings where is_active order by payout_setting_id desc limit 1;
  if not found then v_hold := 3; end if;

  v_gross    := new.amount;
  v_pm_fee   := round(v_gross * v_pm_rate / 100, 2);
  v_plat_fee := case when v_type = 'fixed' then least(v_plat, v_gross)
                     else round(v_gross * v_plat / 100, 2) end;
  v_paid_at  := coalesce(new.paid_at, now());

  insert into landlord_earnings (
    landlord_id, booking_id, payment_id, gross_amount, fee_type, fee_rate,
    service_fee_amount, processing_fee_amount, net_amount, currency, status, available_at
  ) values (
    v_owner, new.booking_id, new.payment_id, v_gross, v_type, v_plat,
    v_plat_fee, v_pm_fee, greatest(v_gross - v_pm_fee - v_plat_fee, 0),
    coalesce(new.currency, 'PHP'), 'pending', v_paid_at + make_interval(days => v_hold)
  )
  on conflict (payment_id) do nothing;
  return new;
end
$$;

drop trigger if exists payments_record_earning on public.payments;
create trigger payments_record_earning
  after insert or update of payment_status_id on public.payments
  for each row execute function public.record_landlord_earning();

-- backfill: online payments that were already paid (a no-op update fires the trigger)
update public.payments
set payment_status_id = payment_status_id
where paymongo_session_id is not null
  and payment_status_id = (select payment_status_id from public.payment_statuses where status_code = 'paid');

-- ---- withdrawals ---------------------------------------------------------------------
create or replace function public.request_landlord_payout(p_landlord bigint, p_method bigint)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_threshold numeric;
  v_total     numeric;
  v_payout    bigint;
begin
  -- serialise concurrent requests from the same landlord
  perform 1 from landlord_earnings where landlord_id = p_landlord for update;

  if exists (select 1 from payouts where landlord_id = p_landlord and status in ('pending', 'processing')) then
    raise exception 'payout_open';
  end if;

  select coalesce(minimum_threshold, 0) into v_threshold
  from payout_settings where is_active order by payout_setting_id desc limit 1;
  v_threshold := coalesce(v_threshold, 0);

  select coalesce(sum(net_amount), 0) into v_total
  from landlord_earnings
  where landlord_id = p_landlord and status = 'pending' and payout_id is null and available_at <= now();

  if v_total <= 0 or v_total < v_threshold then
    raise exception 'below_threshold';
  end if;

  insert into payouts (landlord_id, withdrawal_method_id, amount, currency, status, scheduled_date, reference, created_by)
  values (
    p_landlord, p_method, v_total, 'PHP', 'pending',
    (now() at time zone 'Asia/Manila')::date,
    'WD-' || to_char(now() at time zone 'Asia/Manila', 'YYYYMMDD') || '-' || p_landlord || '-' || (floor(random() * 9000) + 1000)::int,
    p_landlord
  )
  returning payout_id into v_payout;

  update landlord_earnings
  set payout_id = v_payout, status = 'in_payout', updated_at = now()
  where landlord_id = p_landlord and status = 'pending' and payout_id is null and available_at <= now();

  return v_payout;
end
$$;

revoke all on function public.request_landlord_payout(bigint, bigint) from public;
grant execute on function public.request_landlord_payout(bigint, bigint) to service_role;

-- MyBalai's default platform fee is 1.5% (the seeded 1.00 was never edited by anyone)
update public.platform_fee_settings
set fee_value = 1.5
where is_active and fee_type = 'percentage' and fee_value = 1.00 and updated_by is null;

-- the default withdrawal day is the 30th of the month
update public.payout_settings
set frequency = 'monthly', payout_day_1 = 30, payout_day_2 = null
where is_active and frequency = 'twice_monthly' and payout_day_1 = 15 and payout_day_2 = 30 and updated_by is null;

commit;

-- Verify:
--   select column_name from information_schema.columns where table_name = 'platform_fee_settings' and column_name = 'paymongo_fee_rate';
--   select * from public.landlord_earnings;
