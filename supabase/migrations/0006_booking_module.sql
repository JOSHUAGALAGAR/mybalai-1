-- ============================================================
-- 0006_booking_module  (Phase 7)
-- ============================================================
-- Verified before writing:
--   bookings.booking_id  = BIGINT PK, no default, 0 rows
--   booking_statuses seeded: pending / confirmed / checked_in / checked_out /
--     cancelled / rejected  (is_final, is_inventory_blocking flags)
--   trigger prevent_overlapping_bed_booking() already exists on booking_beds
--     (BEFORE INSERT OR UPDATE) — the race-safe double-booking guard.
--
-- This migration adds:
--   1. a sequence-backed DEFAULT for bookings.booking_id
--   2. create_booking()      — atomic pending booking + bed allocation +
--                              rate snapshot + status history + owner notice
--   3. set_booking_status()  — validated transition + inventory re-check +
--                              status history + counterparty notice
--
-- The functions are SECURITY DEFINER and granted to service_role only (the app
-- calls them via the service-role client after doing its own authorization).
-- ============================================================

begin;

create sequence if not exists public.bookings_booking_id_seq
  as bigint start with 1000000 minvalue 1000000 increment by 1
  owned by public.bookings.booking_id;

alter table public.bookings
  alter column booking_id set default nextval('public.bookings_booking_id_seq');

-- ---- helper --------------------------------------------------------------

create or replace function public.booking_status_id(p_code text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select booking_status_id from public.booking_statuses where status_code = p_code
$$;

-- ---- create_booking ----------------------------------------------------

create or replace function public.create_booking(
  p_user bigint,
  p_property bigint,
  p_room bigint,
  p_bed bigint,
  p_rate bigint,
  p_check_in date,
  p_check_out date,
  p_message text,
  p_total numeric,
  p_period text,
  p_price numeric,
  p_rate_valid_from date,
  p_rate_valid_until date
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id bigint;
  v_pending bigint := public.booking_status_id('pending');
  v_owner bigint;
begin
  insert into public.bookings (
    booking_status_id, user_id, property_id, rate_id, room_id, bed_id,
    check_in_date, check_out_date, booking_message, submission_date,
    total_amount, currency
  ) values (
    v_pending, p_user, p_property, p_rate, p_room, p_bed,
    p_check_in, p_check_out,
    nullif(btrim(coalesce(p_message, '')), ''), now(),
    coalesce(p_total, 0), 'PHP'
  )
  returning booking_id into v_booking_id;

  -- Bed allocation. The overlap trigger allows this because the booking is
  -- still pending (multiple pending requests for the same bed are permitted;
  -- confirming a second one later is what trips the guard).
  insert into public.booking_beds (booking_id, bed_id)
  values (v_booking_id, p_bed);

  insert into public.booking_rate_snapshots (
    booking_id, rate_id, period, price, valid_from, valid_until
  ) values (
    v_booking_id, p_rate, coalesce(p_period, 'monthly'),
    coalesce(p_price, 0), p_rate_valid_from, p_rate_valid_until
  );

  insert into public.booking_status_history (
    booking_id, from_status_id, to_status_id, changed_by, notes
  ) values (
    v_booking_id, null, v_pending, p_user, 'Booking requested'
  );

  select property_owner into v_owner
  from public.properties where property_id = p_property;
  if v_owner is not null then
    insert into public.notifications (
      user_id, notification_type, title, message, reference_type, reference_id
    ) values (
      v_owner, 'BOOKING', 'New booking request',
      'A tenant requested to book one of your properties.',
      'booking', v_booking_id
    );
  end if;

  return v_booking_id;
end
$$;

-- ---- set_booking_status ----------------------------------------------

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
begin
  if v_to is null then
    raise exception 'Unknown booking status %', p_to_code using errcode = '22023';
  end if;

  select b.booking_status_id, bs.status_code, b.user_id, p.property_owner
    into v_from, v_from_code, v_user, v_owner
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
    (v_from_code = 'pending'    and p_to_code in ('confirmed', 'rejected', 'cancelled')) or
    (v_from_code = 'confirmed'  and p_to_code in ('checked_in', 'cancelled')) or
    (v_from_code = 'checked_in' and p_to_code = 'checked_out')
  ) then
    raise exception 'Cannot change a % booking to %', v_from_code, p_to_code
      using errcode = '22023';
  end if;

  update public.bookings
     set booking_status_id = v_to,
         status_updated_by = p_actor,
         status_updated_role = p_actor_role,
         landlord_response = case
           when p_to_code in ('confirmed', 'rejected')
           then nullif(btrim(coalesce(p_response, '')), '')
           else landlord_response end,
         landlord_response_by = case
           when p_to_code in ('confirmed', 'rejected') then p_actor
           else landlord_response_by end,
         landlord_response_role = case
           when p_to_code in ('confirmed', 'rejected') then p_actor_role
           else landlord_response_role end,
         landlord_response_updated_at = case
           when p_to_code in ('confirmed', 'rejected') then now()
           else landlord_response_updated_at end
   where booking_id = p_booking;

  -- Re-touch the bed allocation when entering an inventory-blocking status so
  -- prevent_overlapping_bed_booking() re-validates against other
  -- confirmed/checked_in bookings and rolls this transaction back on conflict.
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
      v_user, 'BOOKING', 'Booking ' || p_to_code,
      format('Your booking was %s.', p_to_code), 'booking', p_booking
    );
  end if;

  return p_to_code;
end
$$;

-- ---- grants ------------------------------------------------------------

revoke all on function public.booking_status_id(text) from public;
revoke all on function public.create_booking(
  bigint, bigint, bigint, bigint, bigint, date, date, text, numeric, text,
  numeric, date, date
) from public;
revoke all on function public.set_booking_status(
  bigint, bigint, text, text, text
) from public;

grant execute on function public.booking_status_id(text) to service_role;
grant execute on function public.create_booking(
  bigint, bigint, bigint, bigint, bigint, date, date, text, numeric, text,
  numeric, date, date
) to service_role;
grant execute on function public.set_booking_status(
  bigint, bigint, text, text, text
) to service_role;

commit;
