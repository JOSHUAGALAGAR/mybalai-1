-- ============================================================
-- 0026_cancel_payments_with_booking
-- ============================================================
-- Bug: when a booking was cancelled (or rejected), its payment stayed "Pending" on the landlord's and
-- tenant's Payments pages, and the landlord could still verify it. Only the expiry sweeper closed a
-- booking's payments; set_booking_status() did not.
--
-- Fix, at the database so every path is covered (tenant, landlord, caretaker, admin, mobile):
--   1. cancel_open_payments_for_booking(): moves the booking's PENDING and FAILED payments to
--      'cancelled' and records it in the payment history.
--   2. A trigger on bookings runs it whenever a booking becomes 'cancelled' or 'rejected'.
--   3. One-off backfill for bookings that are already cancelled / rejected.
--
-- PAID payments are deliberately left alone: money was taken, so that goes through the refund flow
-- (superadmin "Refund"), never a silent status change.
--
-- Idempotent. Apply in the Supabase SQL editor (after 0012).
-- ============================================================

begin;

create or replace function public.cancel_open_payments_for_booking(
  p_booking bigint,
  p_actor bigint default null,
  p_actor_role text default 'system'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancelled bigint := public.payment_status_id('cancelled');
  v_count integer := 0;
  r record;
begin
  if v_cancelled is null then
    return 0;
  end if;

  for r in
    select payment_id
      from public.payments
     where booking_id = p_booking
       and payment_status_id in (
         public.payment_status_id('pending'),
         public.payment_status_id('failed')
       )
     for update
  loop
    update public.payments
       set payment_status_id = v_cancelled
     where payment_id = r.payment_id;

    insert into public.payment_status_history (
      payment_id, status, status_actor_id, status_actor_role
    ) values (r.payment_id, 'cancelled', p_actor, p_actor_role);

    v_count := v_count + 1;
  end loop;

  return v_count;
end
$$;

create or replace function public.bookings_close_payments() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_status_id is distinct from old.booking_status_id
     and new.booking_status_id in (
       public.booking_status_id('cancelled'),
       public.booking_status_id('rejected')
     ) then
    perform public.cancel_open_payments_for_booking(
      new.booking_id, new.status_updated_by, coalesce(new.status_updated_role, 'system')
    );
  end if;
  return new;
end
$$;

drop trigger if exists bookings_close_payments on public.bookings;
create trigger bookings_close_payments
  after update of booking_status_id on public.bookings
  for each row execute function public.bookings_close_payments();

revoke all on function public.cancel_open_payments_for_booking(bigint, bigint, text) from public;
grant execute on function public.cancel_open_payments_for_booking(bigint, bigint, text) to service_role;

-- Backfill: bookings that were cancelled / rejected before this fix.
select public.cancel_open_payments_for_booking(b.booking_id)
  from public.bookings b
 where b.booking_status_id in (
         public.booking_status_id('cancelled'),
         public.booking_status_id('rejected')
       )
   and exists (
         select 1 from public.payments p
          where p.booking_id = b.booking_id
            and p.payment_status_id in (
              public.payment_status_id('pending'),
              public.payment_status_id('failed')
            )
       );

commit;

-- Verify (should return no rows):
--   select p.payment_id, b.booking_id from public.payments p
--   join public.bookings b on b.booking_id = p.booking_id
--   join public.booking_statuses bs on bs.booking_status_id = b.booking_status_id
--   join public.payment_statuses ps on ps.payment_status_id = p.payment_status_id
--   where bs.status_code in ('cancelled','rejected') and ps.status_code in ('pending','failed');
