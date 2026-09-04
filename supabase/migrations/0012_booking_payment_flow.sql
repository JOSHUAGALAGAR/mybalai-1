-- ============================================================
-- 0012_booking_payment_flow  (PayMongo spec §6–§16)
-- ============================================================
-- Makes payment part of the booking lifecycle:
--
--   pending (REQUESTED)
--     -> landlord approves -> payment_pending   [bed is HELD; deadline set]
--         -> verified payment (webhook)         -> confirmed
--         -> deadline elapses                   -> expired  [hold released]
--         -> tenant cancels / landlord rejects  -> cancelled / rejected
--   confirmed -> checked_in -> checked_out
--
-- Adds:
--   1. booking_statuses  += payment_pending (blocking), expired (final)
--      payment_statuses  += failed (retryable), expired (final)
--   2. properties.payment_deadline_minutes (default 30)
--      bookings.payment_due_at, payments.expires_at
--   3. set_booking_status() rewritten for the new transition table; entering
--      payment_pending stamps payment_due_at from the property deadline
--   4. settle_booking_payment()  — webhook path: payment -> paid AND, if the
--      booking is payment_pending, booking -> confirmed. Idempotent.
--   5. fail_booking_payment()    — payment -> failed, booking stays
--      payment_pending (retry allowed)
--   6. expire_overdue_bookings(p_booking) — payment_pending past the deadline
--      -> expired + payment -> expired + notice; scheduled via pg_cron when
--      available, and called lazily by the read paths as a backstop
--
-- All functions SECURITY DEFINER, granted to service_role only.
-- ============================================================

begin;

-- ---- 1. reference rows -------------------------------------------------

insert into public.booking_statuses
  (status_code, status_name, description, is_final, is_inventory_blocking)
select v.code, v.name, v.descr, v.final, v.blocking
from (values
  ('payment_pending', 'Payment pending',
   'Approved by the landlord; awaiting the tenant''s payment.', false, true),
  ('expired', 'Expired',
   'The payment window elapsed without a verified payment.', true, false)
) as v(code, name, descr, final, blocking)
where not exists (
  select 1 from public.booking_statuses bs where bs.status_code = v.code
);

insert into public.payment_statuses
  (status_code, status_name, description, is_final)
select v.code, v.name, v.descr, v.final
from (values
  ('failed', 'Failed', 'The payment attempt failed; the tenant may retry.', false),
  ('expired', 'Expired', 'The booking payment window elapsed.', true)
) as v(code, name, descr, final)
where not exists (
  select 1 from public.payment_statuses ps where ps.status_code = v.code
);

-- ---- 2. columns -----------------------------------------------------

alter table public.properties
  add column if not exists payment_deadline_minutes integer not null default 30
    check (payment_deadline_minutes between 5 and 10080);

alter table public.bookings
  add column if not exists payment_due_at timestamptz;

alter table public.payments
  add column if not exists expires_at timestamptz;

-- ---- 3. set_booking_status (rewritten) ---------------------------

create or replace function public.set_booking_status(
  p_booking bigint,
  p_actor bigint,
  p_actor_role text,
  p_to_code text,
  p_response text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from bigint;
  v_from_code text;
  v_to bigint := public.booking_status_id(p_to_code);
  v_blocking boolean;
  v_user bigint;
  v_owner bigint;
  v_deadline integer;
begin
  if v_to is null then
    raise exception 'Unknown booking status %', p_to_code using errcode = '22023';
  end if;

  select b.booking_status_id, bs.status_code, b.user_id, p.property_owner,
         coalesce(p.payment_deadline_minutes, 30)
    into v_from, v_from_code, v_user, v_owner, v_deadline
  from public.bookings b
  join public.properties p on p.property_id = b.property_id
  left join public.booking_statuses bs
    on bs.booking_status_id = b.booking_status_id
  where b.booking_id = p_booking
  for update of b;

  if not found then
    raise exception 'Booking % not found', p_booking using errcode = 'P0002';
  end if;

  if not (
    (v_from_code = 'pending'
       and p_to_code in ('payment_pending', 'rejected', 'cancelled')) or
    (v_from_code = 'payment_pending'
       and p_to_code in ('confirmed', 'expired', 'cancelled', 'rejected')) or
    (v_from_code = 'confirmed'
       and p_to_code in ('checked_in', 'cancelled')) or
    (v_from_code = 'checked_in' and p_to_code = 'checked_out')
  ) then
    raise exception 'Cannot change a % booking to %', v_from_code, p_to_code
      using errcode = '22023';
  end if;

  update public.bookings
     set booking_status_id = v_to,
         status_updated_by = p_actor,
         status_updated_role = p_actor_role,
         payment_due_at = case
           when p_to_code = 'payment_pending'
           then now() + make_interval(mins => v_deadline)
           else payment_due_at end,
         landlord_response = case
           when p_to_code in ('payment_pending', 'rejected')
           then nullif(btrim(coalesce(p_response, '')), '')
           else landlord_response end,
         landlord_response_by = case
           when p_to_code in ('payment_pending', 'rejected') then p_actor
           else landlord_response_by end,
         landlord_response_role = case
           when p_to_code in ('payment_pending', 'rejected') then p_actor_role
           else landlord_response_role end,
         landlord_response_updated_at = case
           when p_to_code in ('payment_pending', 'rejected') then now()
           else landlord_response_updated_at end
   where booking_id = p_booking;

  -- Re-touch the bed allocation when entering an inventory-blocking status so
  -- prevent_overlapping_bed_booking() re-validates against other holds and
  -- rolls this transaction back on conflict (SQLSTATE 23P01).
  select is_inventory_blocking into v_blocking
  from public.booking_statuses where booking_status_id = v_to;
  if v_blocking then
    update public.booking_beds set bed_id = bed_id where booking_id = p_booking;
  end if;

  insert into public.booking_status_history (
    booking_id, from_status_id, to_status_id, changed_by, notes
  ) values (
    p_booking, v_from, v_to, p_actor,
    nullif(btrim(coalesce(p_response, '')), '')
  );

  -- Notifications
  if p_actor = v_user then
    if v_owner is not null then
      insert into public.notifications (
        user_id, notification_type, title, message, reference_type, reference_id
      ) values (
        v_owner, 'BOOKING', 'Booking updated',
        format('A booking was %s by the tenant.', p_to_code),
        'booking', p_booking
      );
    end if;
  else
    insert into public.notifications (
      user_id, notification_type, title, message, reference_type, reference_id
    ) values (
      v_user, 'BOOKING',
      case p_to_code
        when 'payment_pending' then 'Booking approved — payment required'
        when 'confirmed' then 'Booking confirmed'
        when 'rejected' then 'Booking rejected'
        when 'expired' then 'Booking payment window closed'
        else 'Booking ' || p_to_code
      end,
      case p_to_code
        when 'payment_pending'
          then 'Your booking was approved. Pay before the deadline to confirm it.'
        when 'expired'
          then 'The payment window elapsed. Submit a new request if you still want it.'
        else format('Your booking was %s.', p_to_code)
      end,
      'booking', p_booking
    );
  end if;

  return p_to_code;
end
$$;

-- ---- 4. settle_booking_payment (webhook) -----------------------

create or replace function public.settle_booking_payment(
  p_payment bigint,
  p_paymongo_payment_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_user bigint;
  v_booking bigint;
  v_paid bigint := public.payment_status_id('paid');
  v_bstatus text;
  v_bfrom bigint;
  v_bto bigint := public.booking_status_id('confirmed');
  v_owner bigint;
begin
  select ps.status_code, p.user_id, p.booking_id
    into v_status, v_user, v_booking
  from public.payments p
  left join public.payment_statuses ps
    on ps.payment_status_id = p.payment_status_id
  where p.payment_id = p_payment
  for update of p;

  if not found then
    raise exception 'Payment % not found', p_payment using errcode = 'P0002';
  end if;

  if v_status = 'paid' then
    return 'already_paid';           -- idempotent replay
  end if;
  if v_status <> 'pending' then
    raise exception 'Cannot settle a % payment', v_status using errcode = '22023';
  end if;

  update public.payments
     set payment_status_id = v_paid,
         paid_at = coalesce(paid_at, now()),
         paid_channel = 'paymongo',
         paymongo_payment_id = coalesce(p_paymongo_payment_id, paymongo_payment_id)
   where payment_id = p_payment;

  insert into public.payment_status_history (
    payment_id, status, status_actor_id, status_actor_role
  ) values (p_payment, 'paid', v_user, 'system');

  insert into public.notifications (
    user_id, notification_type, title, message, reference_type, reference_id
  ) values (
    v_user, 'PAYMENT', 'Payment received',
    'Your payment was verified.', 'payment', p_payment
  );

  if v_booking is not null then
    select b.booking_status_id, bs.status_code, p.property_owner
      into v_bfrom, v_bstatus, v_owner
    from public.bookings b
    join public.properties p on p.property_id = b.property_id
    left join public.booking_statuses bs
      on bs.booking_status_id = b.booking_status_id
    where b.booking_id = v_booking
    for update of b;

    if v_bstatus = 'payment_pending' then
      update public.bookings
         set booking_status_id = v_bto,
             status_updated_by = v_user,
             status_updated_role = 'system'
       where booking_id = v_booking;

      update public.booking_beds set bed_id = bed_id
       where booking_id = v_booking;

      insert into public.booking_status_history (
        booking_id, from_status_id, to_status_id, changed_by, notes
      ) values (v_booking, v_bfrom, v_bto, v_user, 'Payment verified');

      insert into public.notifications (
        user_id, notification_type, title, message, reference_type, reference_id
      ) values (
        v_user, 'BOOKING', 'Booking confirmed',
        'Your payment cleared — the booking is confirmed.', 'booking', v_booking
      );
      if v_owner is not null then
        insert into public.notifications (
          user_id, notification_type, title, message, reference_type, reference_id
        ) values (
          v_owner, 'BOOKING', 'Booking confirmed',
          'A tenant paid — the booking is confirmed.', 'booking', v_booking
        );
      end if;
    end if;
  end if;

  return 'settled';
end
$$;

-- ---- 5. fail_booking_payment --------------------------------

create or replace function public.fail_booking_payment(
  p_payment bigint,
  p_reason text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_user bigint;
  v_failed bigint := public.payment_status_id('failed');
begin
  select ps.status_code, p.user_id
    into v_status, v_user
  from public.payments p
  left join public.payment_statuses ps
    on ps.payment_status_id = p.payment_status_id
  where p.payment_id = p_payment
  for update of p;

  if not found or v_status <> 'pending' then
    return 'noop';
  end if;

  update public.payments
     set payment_status_id = v_failed
   where payment_id = p_payment;

  insert into public.payment_status_history (
    payment_id, status, status_actor_id, status_actor_role
  ) values (p_payment, 'failed', v_user, 'system');

  insert into public.notifications (
    user_id, notification_type, title, message, reference_type, reference_id
  ) values (
    v_user, 'PAYMENT', 'Payment failed',
    coalesce(nullif(btrim(p_reason), ''), 'Your payment did not go through.')
      || ' You can try again while the window is open.',
    'payment', p_payment
  );

  return 'failed';
end
$$;

-- ---- 6. expire_overdue_bookings ----------------------------

create or replace function public.expire_overdue_bookings(
  p_booking bigint default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_pp bigint := public.booking_status_id('payment_pending');
  v_exp bigint := public.booking_status_id('expired');
  v_pexp bigint := public.payment_status_id('expired');
  v_count integer := 0;
begin
  for r in
    select booking_id, user_id
    from public.bookings
    where booking_status_id = v_pp
      and payment_due_at is not null
      and payment_due_at < now()
      and (p_booking is null or booking_id = p_booking)
    for update
  loop
    update public.bookings
       set booking_status_id = v_exp,
           status_updated_role = 'system'
     where booking_id = r.booking_id;

    insert into public.booking_status_history (
      booking_id, from_status_id, to_status_id, changed_by, notes
    ) values (r.booking_id, v_pp, v_exp, r.user_id, 'Payment window elapsed');

    update public.payments
       set payment_status_id = v_pexp
     where booking_id = r.booking_id
       and payment_status_id = public.payment_status_id('pending');

    insert into public.notifications (
      user_id, notification_type, title, message, reference_type, reference_id
    ) values (
      r.user_id, 'BOOKING', 'Booking payment window closed',
      'The payment window elapsed. Submit a new request if you still want it.',
      'booking', r.booking_id
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end
$$;

-- ---- grants ---------------------------------------------------

revoke all on function public.settle_booking_payment(bigint, text) from public;
revoke all on function public.fail_booking_payment(bigint, text) from public;
revoke all on function public.expire_overdue_bookings(bigint) from public;

grant execute on function public.settle_booking_payment(bigint, text)
  to service_role;
grant execute on function public.fail_booking_payment(bigint, text)
  to service_role;
grant execute on function public.expire_overdue_bookings(bigint)
  to service_role;

commit;

-- ---- 7. schedule the sweeper (best effort; needs pg_cron) --------

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable (%). Enable it in Dashboard -> Database '
      '-> Extensions, then re-run this block. The app also sweeps lazily.',
      sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'mybalai-expire-bookings')
    then
      perform cron.unschedule('mybalai-expire-bookings');
    end if;
    perform cron.schedule(
      'mybalai-expire-bookings', '* * * * *',
      'select public.expire_overdue_bookings();'
    );
  end if;
end $$;
