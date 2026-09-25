-- ============================================================
-- 0014_advance_and_deposit  (1 month advance + 1 month deposit)
-- ============================================================
-- A landlord can require "1 month advance" and/or "1 month security deposit"
-- on a property (the default for its rooms) and on each room.
--
--   properties.require_advance / require_deposit   default for new rooms
--   rooms.require_advance / require_deposit        what actually applies to a booking
--   bookings.advance_amount / deposit_amount       snapshot taken when the tenant books,
--                                                  so later toggles never change an
--                                                  existing booking. bookings.total_amount
--                                                  stays "everything the tenant pays"
--                                                  (rent + advance + deposit), so the
--                                                  PayMongo amount needs no other change.
--
-- create_booking() gets two optional arguments (p_advance, p_deposit, default 0) and
-- stores them in the same transaction as the booking. Existing callers that do not pass
-- them keep working. Existing rows are untouched (everything defaults to false / 0).
--
-- Idempotent — safe to re-run. Apply in the Supabase SQL editor.
-- ============================================================

begin;

alter table public.properties add column if not exists require_advance boolean not null default false;
alter table public.properties add column if not exists require_deposit boolean not null default false;
alter table public.rooms      add column if not exists require_advance boolean not null default false;
alter table public.rooms      add column if not exists require_deposit boolean not null default false;

alter table public.bookings add column if not exists advance_amount numeric(12, 2) not null default 0;
alter table public.bookings add column if not exists deposit_amount numeric(12, 2) not null default 0;

alter table public.bookings drop constraint if exists bookings_advance_deposit_nonneg;
alter table public.bookings add constraint bookings_advance_deposit_nonneg
  check (advance_amount >= 0 and deposit_amount >= 0);

-- ---- create_booking: same as 0006 plus advance / deposit ---------------------
drop function if exists public.create_booking(
  bigint, bigint, bigint, bigint, bigint, date, date, text, numeric, text,
  numeric, date, date
);

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
  p_rate_valid_until date,
  p_advance numeric default 0,
  p_deposit numeric default 0
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
    total_amount, advance_amount, deposit_amount, currency
  ) values (
    v_pending, p_user, p_property, p_rate, p_room, p_bed,
    p_check_in, p_check_out,
    nullif(btrim(coalesce(p_message, '')), ''), now(),
    coalesce(p_total, 0), coalesce(p_advance, 0), coalesce(p_deposit, 0), 'PHP'
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

revoke all on function public.create_booking(
  bigint, bigint, bigint, bigint, bigint, date, date, text, numeric, text,
  numeric, date, date, numeric, numeric
) from public;
grant execute on function public.create_booking(
  bigint, bigint, bigint, bigint, bigint, date, date, text, numeric, text,
  numeric, date, date, numeric, numeric
) to service_role;

commit;

-- Verify:
--   select column_name from information_schema.columns
--     where table_name in ('properties','rooms') and column_name like 'require_%';
--   select column_name from information_schema.columns
--     where table_name = 'bookings' and column_name in ('advance_amount','deposit_amount');
