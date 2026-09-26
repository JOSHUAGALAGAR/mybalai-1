-- ============================================================
-- 0019_refunds_and_boost_lifecycle
-- ============================================================
-- Completes the money model (on top of 0017 payouts and 0018 boosts):
--
--   gross_amount              what the tenant paid
--   processing_fee_amount     PayMongo's fee (borne by the landlord)
--   service_fee_amount        MyBalai's platform fee
--   refund_amount             what was given back to the tenant
--   net_amount                what the landlord gets (gross - both fees)
--   mybalai_revenue           what MyBalai keeps: the platform fee, or 0 once refunded
--
-- 1. landlord_earnings: refund_amount, mybalai_revenue, refunded_at, clawback_settled_at.
-- 2. refund_payment(): marks a PAID payment refunded and reverses its earning.
--    - still in the landlord's balance  -> the earning is 'reversed' (never withdrawable);
--    - already requested / paid out     -> a CLAWBACK (negative adjustment) is recorded and is
--                                          netted off the landlord's next withdrawal.
--    MyBalai returns its own fee with the refund; PayMongo does not return theirs.
-- 3. request_landlord_payout() now nets unsettled clawbacks off the withdrawal.
-- 4. Boost lifecycle: refunded_at / cancelled_reason, and expire_property_boosts() marks boosts
--    whose time has run out as 'expired'.
--
-- Idempotent — safe to re-run. Apply in the Supabase SQL editor (after 0017 and 0018).
-- ============================================================

begin;

alter table public.landlord_earnings
  add column if not exists refund_amount numeric not null default 0,
  add column if not exists mybalai_revenue numeric not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists clawback_settled_at timestamptz;

update public.landlord_earnings
set mybalai_revenue = service_fee_amount
where mybalai_revenue = 0 and refunded_at is null and status <> 'reversed';

-- new earnings record what MyBalai keeps
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
    service_fee_amount, processing_fee_amount, net_amount, mybalai_revenue,
    currency, status, available_at
  ) values (
    v_owner, new.booking_id, new.payment_id, v_gross, v_type, v_plat,
    v_plat_fee, v_pm_fee, greatest(v_gross - v_pm_fee - v_plat_fee, 0), v_plat_fee,
    coalesce(new.currency, 'PHP'), 'pending', v_paid_at + make_interval(days => v_hold)
  )
  on conflict (payment_id) do nothing;
  return new;
end
$$;

-- ---- refunds ---------------------------------------------------------------------------
create or replace function public.refund_payment(p_payment bigint, p_actor bigint, p_note text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_paid   int;
  v_refund int;
  v_status int;
  v_user   bigint;
  e        public.landlord_earnings%rowtype;
begin
  select payment_status_id into v_paid   from payment_statuses where status_code = 'paid';
  select payment_status_id into v_refund from payment_statuses where status_code = 'refunded';

  select payment_status_id, user_id into v_status, v_user
  from payments where payment_id = p_payment and deleted_at is null for update;
  if not found then return 'not_found'; end if;
  if v_status = v_refund then return 'already_refunded'; end if;
  if v_status is distinct from v_paid then return 'not_paid'; end if;

  update payments set payment_status_id = v_refund, updated_at = now() where payment_id = p_payment;

  insert into payment_status_history (payment_id, status, status_actor_id, status_actor_role)
  values (p_payment, 'refunded', p_actor, case when p_actor is null then null else 'superadmin' end);

  if p_actor is not null and p_note is not null and btrim(p_note) <> '' then
    insert into payment_notes (payment_id, author_id, author_role, note)
    values (p_payment, p_actor, 'superadmin', btrim(p_note));
  end if;

  insert into notifications (user_id, notification_type, title, message, reference_type, reference_id)
  values (v_user, 'PAYMENT', 'Payment refunded', 'Your payment was refunded.', 'payment', p_payment);

  select * into e from landlord_earnings where payment_id = p_payment for update;
  if found and e.refunded_at is null then
    if e.status = 'pending' and e.payout_id is null then
      -- still in the landlord's balance: it simply never becomes withdrawable
      update landlord_earnings
      set status = 'reversed', refund_amount = e.gross_amount, refunded_at = now(),
          mybalai_revenue = 0, updated_at = now()
      where earning_id = e.earning_id;
    else
      -- already requested or paid out: record a clawback, netted off the next withdrawal
      update landlord_earnings
      set refund_amount = e.gross_amount, refunded_at = now(), mybalai_revenue = 0,
          adjustment_amount = -e.net_amount, updated_at = now()
      where earning_id = e.earning_id;
    end if;
  end if;
  return 'refunded';
end
$$;
revoke all on function public.refund_payment(bigint, bigint, text) from public;
grant execute on function public.refund_payment(bigint, bigint, text) to service_role;

-- ---- withdrawals net off clawbacks --------------------------------------------------------
create or replace function public.request_landlord_payout(p_landlord bigint, p_method bigint)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_threshold numeric;
  v_ready     numeric;
  v_clawback  numeric;
  v_total     numeric;
  v_payout    bigint;
begin
  perform 1 from landlord_earnings where landlord_id = p_landlord for update;

  if exists (select 1 from payouts where landlord_id = p_landlord and status in ('pending', 'processing')) then
    raise exception 'payout_open';
  end if;

  select coalesce(minimum_threshold, 0) into v_threshold
  from payout_settings where is_active order by payout_setting_id desc limit 1;
  v_threshold := coalesce(v_threshold, 0);

  select coalesce(sum(net_amount), 0) into v_ready
  from landlord_earnings
  where landlord_id = p_landlord and status = 'pending' and payout_id is null and available_at <= now();

  -- refunds of money already withdrawn are taken back out of this withdrawal
  select coalesce(sum(-adjustment_amount), 0) into v_clawback
  from landlord_earnings
  where landlord_id = p_landlord and adjustment_amount < 0
    and status in ('in_payout', 'paid_out') and clawback_settled_at is null;

  v_total := v_ready - v_clawback;
  if v_ready <= 0 or v_total <= 0 or v_total < v_threshold then
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

  update landlord_earnings
  set clawback_settled_at = now(), updated_at = now()
  where landlord_id = p_landlord and adjustment_amount < 0
    and status in ('in_payout', 'paid_out') and clawback_settled_at is null and payout_id is distinct from v_payout;

  return v_payout;
end
$$;
revoke all on function public.request_landlord_payout(bigint, bigint) from public;
grant execute on function public.request_landlord_payout(bigint, bigint) to service_role;

-- ---- boost lifecycle -----------------------------------------------------------------------
alter table public.property_boosts
  add column if not exists refunded_at timestamptz,
  add column if not exists cancelled_reason text;

create or replace function public.expire_property_boosts() returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update property_boosts
  set status = 'expired', is_active = false, updated_at = now()
  where status = 'active' and ends_at is not null and ends_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke all on function public.expire_property_boosts() from public;
grant execute on function public.expire_property_boosts() to service_role;

commit;

-- Verify:
--   select column_name from information_schema.columns where table_name = 'landlord_earnings' and column_name in ('refund_amount','mybalai_revenue');
