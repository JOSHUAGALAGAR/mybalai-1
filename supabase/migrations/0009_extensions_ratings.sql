-- ============================================================
-- 0009_extensions_ratings  (Phase 10)
-- ============================================================
-- Verified before writing (live project bufheqqxgankkzbetkty):
--   booking_extensions.extension_id = BIGINT PK, no default, 0 rows
--     columns: booking_id, previous_check_out_date, extended_check_out_date,
--              amount, payment_id, created_by, created_at
--     -- NO status column: the baseline table records a granted extension, not
--        a request. Phase 10 adds a request -> approve / reject workflow.
--   property_ratings.rating_id     = BIGINT PK, no default, 0 rows
--     columns: property_id, user_id, rating (smallint), review, created_at,
--              updated_at
--
-- Adds:
--   1. sequence-backed DEFAULTs (+ setval guards) for the two bare BIGINT PKs
--   2. workflow columns on booking_extensions (status + decision metadata)
--   3. rating guardrails: 1..5 CHECK, one row per (property, user), and a
--      landlord public-response trio on property_ratings
--   4. create_booking_extension()      — tenant request + owner notice
--   5. set_booking_extension_status()  — approve / reject / cancel; on approve
--      it moves bookings.check_out_date, re-touches booking_beds so the
--      baseline overlap trigger re-validates, and opens a pending payment for
--      the extension amount via create_payment()
--
-- The two functions are SECURITY DEFINER and granted to service_role only —
-- the app calls them through the service-role client after its own authz.
-- ============================================================

begin;

-- ---- 1. id sequences -------------------------------------------------

create sequence if not exists public.booking_extensions_extension_id_seq
  as bigint start with 1000000 minvalue 1000000 increment by 1
  owned by public.booking_extensions.extension_id;
alter table public.booking_extensions
  alter column extension_id
  set default nextval('public.booking_extensions_extension_id_seq');
select setval(
  'public.booking_extensions_extension_id_seq',
  greatest(
    (select coalesce(max(extension_id), 0) from public.booking_extensions),
    1000000
  ),
  true
);

create sequence if not exists public.property_ratings_rating_id_seq
  as bigint start with 1000000 minvalue 1000000 increment by 1
  owned by public.property_ratings.rating_id;
alter table public.property_ratings
  alter column rating_id
  set default nextval('public.property_ratings_rating_id_seq');
select setval(
  'public.property_ratings_rating_id_seq',
  greatest(
    (select coalesce(max(rating_id), 0) from public.property_ratings),
    1000000
  ),
  true
);

-- ---- 2. booking_extensions workflow columns ------------------------

alter table public.booking_extensions
  add column if not exists status text not null default 'pending',
  add column if not exists tenant_message text,
  add column if not exists decided_by bigint
    references public.user_accounts (legacy_user_id),
  add column if not exists decided_role text,
  add column if not exists manager_response text,
  add column if not exists decided_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'booking_extensions_status_check'
  ) then
    alter table public.booking_extensions
      add constraint booking_extensions_status_check
      check (status in ('pending', 'approved', 'rejected', 'cancelled'));
  end if;
end $$;

create index if not exists booking_extensions_booking_id_idx
  on public.booking_extensions (booking_id);

-- ---- 3. property_ratings guardrails ------------------------------

alter table public.property_ratings
  add column if not exists landlord_response text,
  add column if not exists landlord_response_by bigint
    references public.user_accounts (legacy_user_id),
  add column if not exists landlord_response_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'property_ratings_rating_check'
  ) then
    alter table public.property_ratings
      add constraint property_ratings_rating_check
      check (rating between 1 and 5);
  end if;
end $$;

-- one rating per tenant per property (enables upsert on this target)
create unique index if not exists property_ratings_property_user_key
  on public.property_ratings (property_id, user_id);

-- ---- 4. create_booking_extension --------------------------------

create or replace function public.create_booking_extension(
  p_booking bigint,
  p_requested_by bigint,
  p_new_check_out date,
  p_amount numeric,
  p_message text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_extension_id bigint;
  v_status_code text;
  v_check_out date;
  v_owner bigint;
begin
  select bs.status_code, b.check_out_date, p.property_owner
    into v_status_code, v_check_out, v_owner
  from public.bookings b
  join public.properties p on p.property_id = b.property_id
  left join public.booking_statuses bs
    on bs.booking_status_id = b.booking_status_id
  where b.booking_id = p_booking
    and b.deleted_at is null
  for update of b;

  if not found then
    raise exception 'Booking % not found', p_booking using errcode = 'P0002';
  end if;

  if v_status_code not in ('confirmed', 'checked_in') then
    raise exception 'Only an active booking can be extended (this one is %)',
      coalesce(v_status_code, 'unknown') using errcode = '22023';
  end if;

  if p_new_check_out <= v_check_out then
    raise exception 'The new check-out date must be after the current one'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.booking_extensions
    where booking_id = p_booking and status = 'pending'
  ) then
    raise exception 'This booking already has a pending extension request'
      using errcode = '22023';
  end if;

  insert into public.booking_extensions (
    booking_id, previous_check_out_date, extended_check_out_date,
    amount, created_by, tenant_message, status
  ) values (
    p_booking, v_check_out, p_new_check_out,
    coalesce(p_amount, 0), p_requested_by,
    nullif(btrim(coalesce(p_message, '')), ''), 'pending'
  )
  returning extension_id into v_extension_id;

  if v_owner is not null then
    -- reference the booking so the notification links to the booking detail,
    -- where the extension request panel lives.
    insert into public.notifications (
      user_id, notification_type, title, message, reference_type, reference_id
    ) values (
      v_owner, 'EXTENSION', 'Extension requested',
      'A tenant asked to extend their stay.', 'booking', p_booking
    );
  end if;

  return v_extension_id;
end
$$;

-- ---- 5. set_booking_extension_status ---------------------------

create or replace function public.set_booking_extension_status(
  p_extension bigint,
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
  v_from_code text;
  v_booking bigint;
  v_new_check_out date;
  v_amount numeric;
  v_requested_by bigint;
  v_tenant bigint;
  v_payment_id bigint;
begin
  if p_to_code not in ('approved', 'rejected', 'cancelled') then
    raise exception 'Unknown extension status %', p_to_code
      using errcode = '22023';
  end if;

  select e.status, e.booking_id, e.extended_check_out_date, e.amount,
         e.created_by, b.user_id
    into v_from_code, v_booking, v_new_check_out, v_amount,
         v_requested_by, v_tenant
  from public.booking_extensions e
  join public.bookings b on b.booking_id = e.booking_id
  where e.extension_id = p_extension
  for update of e, b;

  if not found then
    raise exception 'Extension % not found', p_extension using errcode = 'P0002';
  end if;

  if v_from_code <> 'pending' then
    raise exception 'This extension was already %', v_from_code
      using errcode = '22023';
  end if;

  if p_to_code = 'cancelled' and p_actor <> v_requested_by then
    raise exception 'Only the tenant who asked can cancel this request'
      using errcode = '22023';
  end if;

  if p_to_code = 'approved' then
    update public.bookings
       set check_out_date = v_new_check_out,
           updated_at = now()
     where booking_id = v_booking;

    -- Re-touch the bed allocation so prevent_overlapping_bed_booking()
    -- re-checks the (now longer) stay against other blocking bookings and
    -- rolls this transaction back on conflict (SQLSTATE 23P01).
    update public.booking_beds set bed_id = bed_id where booking_id = v_booking;

    v_payment_id := public.create_payment(
      v_tenant, p_actor, p_actor_role, v_booking, coalesce(v_amount, 0),
      null::bigint, null::text, null::timestamptz,
      'Booking extension #' || p_extension
    );
  end if;

  update public.booking_extensions
     set status = p_to_code,
         decided_by = p_actor,
         decided_role = p_actor_role,
         decided_at = now(),
         manager_response = nullif(btrim(coalesce(p_response, '')), ''),
         payment_id = coalesce(v_payment_id, payment_id)
   where extension_id = p_extension;

  if p_to_code = 'cancelled' then
    insert into public.notifications (
      user_id, notification_type, title, message, reference_type, reference_id
    )
    select p.property_owner, 'EXTENSION', 'Extension cancelled',
           'A tenant cancelled an extension request.', 'booking', v_booking
    from public.bookings b
    join public.properties p on p.property_id = b.property_id
    where b.booking_id = v_booking and p.property_owner is not null;
  else
    insert into public.notifications (
      user_id, notification_type, title, message, reference_type, reference_id
    ) values (
      v_tenant, 'EXTENSION', 'Extension ' || p_to_code,
      case
        when p_to_code = 'approved'
        then 'Your extension was approved. A payment is now due.'
        else 'Your extension request was declined.'
      end,
      'booking', v_booking
    );
  end if;

  return p_to_code;
end
$$;

-- ---- grants ------------------------------------------------------------

revoke all on function public.create_booking_extension(
  bigint, bigint, date, numeric, text
) from public;
revoke all on function public.set_booking_extension_status(
  bigint, bigint, text, text, text
) from public;

grant execute on function public.create_booking_extension(
  bigint, bigint, date, numeric, text
) to service_role;
grant execute on function public.set_booking_extension_status(
  bigint, bigint, text, text, text
) to service_role;

commit;
