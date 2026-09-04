-- ============================================================
-- 0007_payment_module  (Phase 8)
-- ============================================================
-- Verified before writing:
--   payments.payment_id            = BIGINT PK, no default, 0 rows
--   payment_note_replies.reply_id  = BIGINT PK, no default, 0 rows
--   payment_statuses seeded: pending / paid / unpaid / rejected / refunded /
--     cancelled   (is_final flags)
--   payment_methods  seeded: gcash / maya / bank_transfer / cash / other
--
-- Adds:
--   1. sequence-backed DEFAULTs for the two bare BIGINT PKs
--   2. create_payment()      — atomic pending payment + history + owner notice
--   3. set_payment_status()  — server-only verify / reject / cancel with
--                              validated transitions + history + payer notice
--
-- SECURITY DEFINER, granted to service_role only. Spec §27: "the client must
-- never be able to directly mark a payment as verified" — all payment
-- mutations go through these functions, called by the service-role client
-- after application-level authorization.
-- ============================================================

begin;

create sequence if not exists public.payments_payment_id_seq
  as bigint start with 1000000 minvalue 1000000 increment by 1
  owned by public.payments.payment_id;
alter table public.payments
  alter column payment_id set default nextval('public.payments_payment_id_seq');

create sequence if not exists public.payment_note_replies_reply_id_seq
  as bigint start with 1000000 minvalue 1000000 increment by 1
  owned by public.payment_note_replies.reply_id;
alter table public.payment_note_replies
  alter column reply_id
  set default nextval('public.payment_note_replies_reply_id_seq');

-- ---- helper ----------------------------------------------------------

create or replace function public.payment_status_id(p_code text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select payment_status_id from public.payment_statuses where status_code = p_code
$$;

-- ---- create_payment ------------------------------------------------

create or replace function public.create_payment(
  p_user bigint,
  p_created_by bigint,
  p_created_by_role text,
  p_booking bigint,
  p_amount numeric,
  p_method bigint,
  p_reference text,
  p_paid_at timestamptz,
  p_note text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id bigint;
  v_pending bigint := public.payment_status_id('pending');
  v_owner bigint;
begin
  insert into public.payments (
    payment_status_id, booking_id, user_id, created_by_id, created_by_role,
    amount, payment_method_id, reference_number, notes, paid_at, currency
  ) values (
    v_pending, p_booking, p_user, p_created_by, p_created_by_role,
    coalesce(p_amount, 0), p_method,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    p_paid_at, 'PHP'
  )
  returning payment_id into v_payment_id;

  insert into public.payment_status_history (
    payment_id, status, status_actor_id, status_actor_role
  ) values (v_payment_id, 'pending', p_created_by, p_created_by_role);

  if p_booking is not null then
    select p.property_owner into v_owner
    from public.bookings b
    join public.properties p on p.property_id = b.property_id
    where b.booking_id = p_booking;
    if v_owner is not null then
      insert into public.notifications (
        user_id, notification_type, title, message, reference_type, reference_id
      ) values (
        v_owner, 'PAYMENT', 'Payment submitted',
        'A tenant submitted a payment for review.', 'payment', v_payment_id
      );
    end if;
  end if;

  return v_payment_id;
end
$$;

-- ---- set_payment_status ------------------------------------------

create or replace function public.set_payment_status(
  p_payment bigint,
  p_actor bigint,
  p_actor_role text,
  p_to_code text,
  p_note text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_code text;
  v_to bigint := public.payment_status_id(p_to_code);
  v_user bigint;
begin
  if v_to is null then
    raise exception 'Unknown payment status %', p_to_code using errcode = '22023';
  end if;

  select ps.status_code, pmt.user_id
    into v_from_code, v_user
  from public.payments pmt
  left join public.payment_statuses ps
    on ps.payment_status_id = pmt.payment_status_id
  where pmt.payment_id = p_payment
  for update of pmt;

  if not found then
    raise exception 'Payment % not found', p_payment using errcode = 'P0002';
  end if;

  if not (
    v_from_code = 'pending'
    and p_to_code in ('paid', 'rejected', 'cancelled', 'unpaid')
  ) then
    raise exception 'Cannot change a % payment to %', v_from_code, p_to_code
      using errcode = '22023';
  end if;

  update public.payments
     set payment_status_id = v_to,
         paid_at = case when p_to_code = 'paid' then coalesce(paid_at, now())
                        else paid_at end
   where payment_id = p_payment;

  insert into public.payment_status_history (
    payment_id, status, status_actor_id, status_actor_role
  ) values (p_payment, p_to_code, p_actor, p_actor_role);

  if p_note is not null and btrim(p_note) <> '' then
    insert into public.payment_notes (payment_id, author_id, author_role, note)
    values (p_payment, p_actor, p_actor_role, btrim(p_note));
  end if;

  if p_actor <> v_user then
    insert into public.notifications (
      user_id, notification_type, title, message, reference_type, reference_id
    ) values (
      v_user, 'PAYMENT', 'Payment ' || p_to_code,
      format('Your payment was marked %s.', p_to_code), 'payment', p_payment
    );
  end if;

  return p_to_code;
end
$$;

-- ---- grants --------------------------------------------------------

revoke all on function public.payment_status_id(text) from public;
revoke all on function public.create_payment(
  bigint, bigint, text, bigint, numeric, bigint, text, timestamptz, text
) from public;
revoke all on function public.set_payment_status(
  bigint, bigint, text, text, text
) from public;

grant execute on function public.payment_status_id(text) to service_role;
grant execute on function public.create_payment(
  bigint, bigint, text, bigint, numeric, bigint, text, timestamptz, text
) to service_role;
grant execute on function public.set_payment_status(
  bigint, bigint, text, text, text
) to service_role;

commit;
