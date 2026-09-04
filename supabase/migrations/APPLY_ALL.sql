-- ============================================================
-- APPLY_ALL.sql  —  MyBalai hosted-DB setup, migrations 0001–0012
--
-- Generated 2026-09-04T07:04:01Z. Paste the whole file into the
-- Supabase SQL editor (project bufheqqxgankkzbetkty) and Run.
--
-- Idempotent (begin/commit + guards). 0004 fixes 'null property_id';
-- 0010 subscriptions; 0011 PayMongo plumbing; 0012 booking<->payment
-- lifecycle (payment_pending / expired, deadlines, settle/fail RPCs).
-- 0012's last block needs pg_cron — enable it in Dashboard -> Database
-- -> Extensions if the NOTICE says it is unavailable.
-- ============================================================


-- >>>>>>>>>>>>>>>>>>>>  0001_new_record_id_sequences.sql  >>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 0001_new_record_id_sequences
-- ============================================================
-- The baseline schema keeps legacy MySQL identifiers by declaring operational
-- primary keys as plain BIGINT with NO default (spec §16). Correct for the
-- data migration, but the app cannot create new rows without supplying an id.
--
-- Phase 2 (authentication) needs new self-serve tenants to get an id, so this
-- migration attaches a sequence-backed DEFAULT to:
--   public.user_accounts.legacy_user_id
--
-- The sequence starts at 1,000,000 — above every legacy id in the source dump
-- (examples: property 25005, room 75005, bed 150010). Legacy rows are still
-- inserted with explicit ids and will not collide.
--
-- The same pattern is added per table as later phases need it
-- (properties in Phase 4, rooms/beds/rates/bookings/payments after).
--
-- AFTER importing legacy user data, bump the sequence:
--   select setval('public.user_accounts_legacy_user_id_seq',
--     greatest((select coalesce(max(legacy_user_id), 0) from public.user_accounts),
--              1000000));
-- ============================================================

begin;

create sequence if not exists public.user_accounts_legacy_user_id_seq
  as bigint
  start with 1000000
  minvalue 1000000
  increment by 1
  owned by public.user_accounts.legacy_user_id;

alter table public.user_accounts
  alter column legacy_user_id
  set default nextval('public.user_accounts_legacy_user_id_seq');

-- Advance past any rows that already exist (legacy import, or accounts
-- provisioned manually before this migration ran) so the next id never
-- collides. Safe to re-run.
select setval(
  'public.user_accounts_legacy_user_id_seq',
  greatest(
    (select coalesce(max(legacy_user_id), 0) from public.user_accounts),
    1000000
  ),
  true
);

comment on sequence public.user_accounts_legacy_user_id_seq is
  'IDs for NEW app-created users. Legacy MySQL user ids are inserted explicitly and stay below 1,000,000. Run setval() to the current max after a legacy import.';

commit;


-- >>>>>>>>>>>>>>>>>>>>  0002_roles_admin_to_superadmin.sql  >>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 0002_roles_admin_to_superadmin
-- ============================================================
-- The updated spec (§38) defines exactly four account types:
--   tenant, landlord, caretaker, superadmin
--
-- The baseline seed created `admin`. This migration renames it to
-- `superadmin`, migrating any dependent user_roles rows first.
--
-- Idempotent: safe to run whether or not `superadmin` already exists.
-- ============================================================

begin;

-- Case 1: only `admin` exists -> rename it in place (keeps role_id, so any
-- user_roles / FK references stay valid).
update public.roles
set role_code = 'superadmin',
    role_name = 'Superadmin',
    description = 'Platform-level system administrator'
where role_code = 'admin'
  and not exists (select 1 from public.roles where role_code = 'superadmin');

-- Case 2: both exist (e.g. partial prior run) -> repoint user_roles to the
-- superadmin role_id, then drop the stale `admin` row.
update public.user_roles ur
set role_id = (select role_id from public.roles where role_code = 'superadmin')
where ur.role_id = (select role_id from public.roles where role_code = 'admin')
  and exists (select 1 from public.roles where role_code = 'superadmin');

delete from public.roles
where role_code = 'admin'
  and exists (select 1 from public.roles where role_code = 'superadmin');

commit;

-- Verify:
--   select role_id, role_code, role_name from public.roles order by role_id;
--   -> tenant, landlord, caretaker, superadmin  (no `admin`)


-- >>>>>>>>>>>>>>>>>>>>  0003_handle_new_user.sql  >>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 0003_handle_new_user
-- ============================================================
-- Provisions a MyBalai account whenever a Supabase Auth user is created
-- (email/password signup or Google OAuth).
--
-- Reads `role` and `full_name` from raw_user_meta_data:
--   - Public signup always sends role = 'tenant' (spec §42).
--   - A future provisioning flow (Superadmin / Landlord-invites-Caretaker)
--     may set 'landlord' | 'caretaker' | 'superadmin' in metadata before
--     the auth user is created.
-- Then:
--   1. inserts public.user_accounts (id from the sequence added in 0001)
--   2. links the role in public.user_roles
--   3. creates the matching role profile row (tenant/landlord/caretaker;
--      superadmin has no profile table)
--
-- SECURITY DEFINER so it runs past RLS. Idempotent per auth user.
--
-- Depends on: 0001 (legacy_user_id default), 0002 (superadmin role exists).
-- ============================================================

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_full_name text;
  v_role_id bigint;
  v_legacy_user_id bigint;
begin
  v_role := lower(coalesce(new.raw_user_meta_data->>'role', 'tenant'));
  v_full_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');

  if v_role not in ('tenant', 'landlord', 'caretaker', 'superadmin') then
    raise exception 'Unsupported signup role: %', v_role
      using errcode = '22023';
  end if;

  select role_id into v_role_id
  from public.roles
  where role_code = v_role;

  if v_role_id is null then
    raise exception 'Role % is not configured in public.roles', v_role
      using errcode = '23503';
  end if;

  -- Reuse an existing mapping if present (idempotency), else mint a new id.
  select legacy_user_id into v_legacy_user_id
  from public.user_accounts
  where auth_user_id = new.id;

  if v_legacy_user_id is null then
    insert into public.user_accounts (auth_user_id, email, full_name)
    values (new.id, new.email, v_full_name)
    returning legacy_user_id into v_legacy_user_id;
  end if;

  insert into public.user_roles (legacy_user_id, role_id)
  values (v_legacy_user_id, v_role_id)
  on conflict (legacy_user_id, role_id) do nothing;

  if v_role = 'tenant' then
    insert into public.tenant_profiles (legacy_user_id)
    values (v_legacy_user_id)
    on conflict (legacy_user_id) do nothing;
  elsif v_role = 'landlord' then
    insert into public.landlord_profiles (legacy_user_id)
    values (v_legacy_user_id)
    on conflict (legacy_user_id) do nothing;
  elsif v_role = 'caretaker' then
    insert into public.caretaker_profiles (legacy_user_id)
    values (v_legacy_user_id)
    on conflict (legacy_user_id) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Trigger fn: provisions user_accounts + user_roles + role profile from auth.users metadata on signup.';

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

commit;


-- >>>>>>>>>>>>>>>>>>>>  0004_property_module.sql  >>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 0004_property_module  (Phase 4 — landlord property management)
-- ============================================================
-- Verified against the live DB before writing:
--   property_types, room_types, amenity_categories, amenities  = 0 rows
--   properties, rooms, beds, rental_rates                      = 0 rows,
--     BIGINT primary keys with NO default
--
-- This migration:
--   1. adds sequence-backed DEFAULTs to the operational PKs the app creates
--   2. adds a sequence-backed DEFAULT to amenities.amenity_id
--   3. seeds the reference catalogs the property/room forms need
--
-- No tables, columns, or constraints from the baseline (spec §31) are changed.
-- Sequences start at 1,000,000 (above every legacy id in the source dump).
-- After a legacy import, bump each with setval() to its max.
-- ============================================================

begin;

-- ---- 1. operational id sequences -------------------------------------------

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('properties',    'property_id'),
      ('rooms',         'room_id'),
      ('beds',          'bed_id'),
      ('rental_rates',  'rate_id'),
      ('amenities',     'amenity_id')
    ) as v(tbl, col)
  loop
    execute format(
      'create sequence if not exists public.%I as bigint start with 1000000 '
      || 'minvalue 1000000 increment by 1 owned by public.%I.%I',
      t.tbl || '_' || t.col || '_seq', t.tbl, t.col
    );
    execute format(
      'alter table public.%I alter column %I set default '
      || 'nextval(''public.%I'')',
      t.tbl, t.col, t.tbl || '_' || t.col || '_seq'
    );
  end loop;
end $$;

-- ---- 2. property types ----------------------------------------------------

insert into public.property_types (type_name, description)
select v.type_name, v.description
from (values
  ('Apartment',      'Self-contained residential unit in a building'),
  ('Condominium',    'Privately owned unit in a shared building'),
  ('House',          'Standalone residential house'),
  ('Townhouse',      'Multi-floor house sharing walls with neighbours'),
  ('Studio',         'Single open-plan room with kitchenette'),
  ('Dormitory',      'Shared rooms with multiple beds'),
  ('Boarding House',  'Rooms for rent, often with shared facilities'),
  ('Bed Space',      'Individual bed within a shared room')
) as v(type_name, description)
where not exists (select 1 from public.property_types);

-- ---- 3. room types -----------------------------------------------------

insert into public.room_types (room_type_name, description, max_occupants)
select v.name, v.description, v.max_occupants
from (values
  ('Single',  'One occupant',            1),
  ('Double',  'Two occupants',           2),
  ('Triple',  'Three occupants',         3),
  ('Quad',    'Four occupants',          4),
  ('Family',  'Family room',             6),
  ('Shared',  'Shared / bed-space room', 8),
  ('Studio',  'Studio-style room',       2)
) as v(name, description, max_occupants)
where not exists (select 1 from public.room_types);

-- ---- 4. amenity categories + amenities ------------------------------------

insert into public.amenity_categories (category_name)
select v.name
from (values
  ('Connectivity'),
  ('Comfort'),
  ('Utilities'),
  ('Kitchen'),
  ('Bathroom'),
  ('Security'),
  ('Building'),
  ('Policies')
) as v(name)
where not exists (select 1 from public.amenity_categories);

insert into public.amenities (amenity_category_id, amenity_name, description)
select
  (select amenity_category_id from public.amenity_categories
   where category_name = v.category),
  v.name,
  v.description
from (values
  ('Connectivity', 'Wi-Fi',              'Wireless internet access'),
  ('Connectivity', 'Wired Internet',     'LAN internet connection'),
  ('Comfort',      'Air Conditioning',   'Air-conditioned room'),
  ('Comfort',      'Electric Fan',       'Ceiling or stand fan provided'),
  ('Comfort',      'Bed & Mattress',     'Bed frame and mattress provided'),
  ('Comfort',      'Study Desk',         'Desk and chair provided'),
  ('Comfort',      'Wardrobe',           'Closet or cabinet for clothes'),
  ('Utilities',    'Water Included',     'Water bill covered by rent'),
  ('Utilities',    'Electricity Included','Electricity bill covered by rent'),
  ('Utilities',    'Laundry Area',       'Access to a laundry / washing area'),
  ('Kitchen',      'Shared Kitchen',     'Access to a shared kitchen'),
  ('Kitchen',      'Private Kitchen',    'Private kitchen in the unit'),
  ('Kitchen',      'Refrigerator',       'Refrigerator available'),
  ('Bathroom',     'Private Bathroom',   'Bathroom exclusive to the unit'),
  ('Bathroom',     'Shared Bathroom',    'Shared bathroom facilities'),
  ('Bathroom',     'Hot Shower',         'Hot / warm water shower'),
  ('Security',     'CCTV',               'CCTV surveillance on premises'),
  ('Security',     'Security Guard',     'On-site security personnel'),
  ('Security',     'Gated Entry',        'Gated or keycard entry'),
  ('Building',     'Elevator',           'Building has an elevator'),
  ('Building',     'Parking',            'Parking space available'),
  ('Building',     'Near Public Transit','Close to jeepney / bus / train'),
  ('Policies',     'Pet Friendly',       'Pets are allowed'),
  ('Policies',     'Curfew',             'Property enforces a curfew')
) as v(category, name, description)
where not exists (select 1 from public.amenities);

commit;

-- Verify:
--   select count(*) from public.property_types;   -- 8
--   select count(*) from public.room_types;       -- 7
--   select count(*) from public.amenities;        -- 24
--   select column_default from information_schema.columns
--    where table_schema='public' and table_name='properties'
--      and column_name='property_id';             -- nextval(...)


-- >>>>>>>>>>>>>>>>>>>>  0005_caretaker_assignments.sql  >>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 0005_caretaker_assignments  (Phase 5)
-- ============================================================
-- Verified missing on the live DB before writing.
--
-- Resource-level link between a caretaker and the properties a landlord has
-- assigned to them (spec §45). Caretaker operational access is derived from an
-- ACTIVE row here — never from the global `caretaker` role alone.
--
-- RLS is enabled with no policy (locked to the service role), matching how the
-- rest of the property module is accessed — all reads/writes go through the
-- service layer with ownership / assignment checks in application code.
-- ============================================================

begin;

create table if not exists public.caretaker_property_assignments (
  assignment_id bigint generated by default as identity primary key,
  caretaker_id bigint not null
    references public.user_accounts(legacy_user_id) on delete cascade,
  property_id bigint not null
    references public.properties(property_id) on delete cascade,
  assigned_by bigint
    references public.user_accounts(legacy_user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  is_active boolean not null default true,
  unique (caretaker_id, property_id)
);

create index if not exists idx_caretaker_assignments_caretaker
  on public.caretaker_property_assignments(caretaker_id);

create index if not exists idx_caretaker_assignments_property
  on public.caretaker_property_assignments(property_id);

create index if not exists idx_caretaker_assignments_active
  on public.caretaker_property_assignments(caretaker_id, is_active);

alter table public.caretaker_property_assignments enable row level security;

commit;

-- Verify:
--   select to_regclass('public.caretaker_property_assignments');  -- not null


-- >>>>>>>>>>>>>>>>>>>>  0006_booking_module.sql  >>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>  0007_payment_module.sql  >>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>  0007b_receipt_storage.sql  >>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 0007b_receipt_storage  (Phase 8 — Supabase Storage setup)
-- ============================================================
-- Run this alongside 0007. Creates the private bucket for payment receipts and
-- lets authenticated users upload into it. Reads are done server-side with
-- short-lived signed URLs (service-role), so no SELECT policy is needed.
--
-- If you prefer the dashboard: Storage → New bucket → name "payment-receipts",
-- "Public bucket" OFF; then add the INSERT policy below under Storage → Policies.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts', 'payment-receipts', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "receipts authenticated upload" on storage.objects;
create policy "receipts authenticated upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'payment-receipts');


-- >>>>>>>>>>>>>>>>>>>>  0008_messaging_module.sql  >>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 0008_messaging_module  (Phase 9)
-- ============================================================
-- Verified before writing:
--   chat_messages.message_id      = BIGINT PK, no default, 0 rows
--   property_inquiries.inquiry_id = BIGINT PK, no default, 0 rows
--   notifications.notification_id = BIGINT IDENTITY (already has a default)
--   RLS policies already exist:
--     chat_messages       -> own_chat_messages (S), send_chat_messages (I)
--     property_inquiries  -> inquiry_participant_read (S), tenant_create_inquiry (I)
--     notifications       -> own_notifications (S), update_own_notifications (U)
--
-- Adds:
--   1. sequence-backed DEFAULTs for the two bare BIGINT PKs (+ setval guard)
--   2. chat_messages and notifications into the supabase_realtime publication
--      so the browser client can subscribe to INSERTs (Supabase Realtime,
--      RLS-filtered) — spec §8, §49.
-- ============================================================

begin;

create sequence if not exists public.chat_messages_message_id_seq
  as bigint start with 1000000 minvalue 1000000 increment by 1
  owned by public.chat_messages.message_id;
alter table public.chat_messages
  alter column message_id
  set default nextval('public.chat_messages_message_id_seq');
select setval(
  'public.chat_messages_message_id_seq',
  greatest((select coalesce(max(message_id), 0) from public.chat_messages), 1000000),
  true
);

create sequence if not exists public.property_inquiries_inquiry_id_seq
  as bigint start with 1000000 minvalue 1000000 increment by 1
  owned by public.property_inquiries.inquiry_id;
alter table public.property_inquiries
  alter column inquiry_id
  set default nextval('public.property_inquiries_inquiry_id_seq');
select setval(
  'public.property_inquiries_inquiry_id_seq',
  greatest((select coalesce(max(inquiry_id), 0) from public.property_inquiries), 1000000),
  true
);

commit;

-- ---- Realtime publication (outside the txn; ADD errors if already a member) --

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;


-- >>>>>>>>>>>>>>>>>>>>  0009_extensions_ratings.sql  >>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>  0010_subscriptions.sql  >>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 0010_subscriptions  (Phase 11 — part 1: plans + landlord subscriptions)
-- ============================================================
-- Verified before writing (live project bufheqqxgankkzbetkty):
--   no subscription_plans / landlord_subscriptions table exists;
--   landlord_wallets + property_boosts are a separate coin/boost economy.
--
-- Model (per product decisions):
--   * A subscription is PER LANDLORD ACCOUNT.
--   * A plan defines four caps: max_properties, max_rooms_per_property,
--     max_beds_per_room, max_caretakers.
--   * The superadmin creates plans and assigns/activates a plan for a
--     landlord by hand (no payment flow here).
--   * A landlord with no ACTIVE subscription can create nothing — the
--     service layer enforces every cap.
--
-- Adds:
--   1. subscription_plans        — the catalog (seeded with a Free plan)
--   2. landlord_subscriptions    — one row per landlord (unique), the
--      superadmin-controlled assignment
--
-- Both tables have RLS enabled with NO policy: they are reached only through
-- the service layer + service-role client, matching the rest of the app.
-- ============================================================

begin;

-- ---- 1. subscription_plans -----------------------------------------

create sequence if not exists public.subscription_plans_plan_id_seq
  as bigint start with 1 minvalue 1 increment by 1;

create table if not exists public.subscription_plans (
  plan_id bigint primary key
    default nextval('public.subscription_plans_plan_id_seq'),
  code text not null unique,
  name text not null,
  description text,
  max_properties integer not null default 0 check (max_properties >= 0),
  max_rooms_per_property integer not null default 0
    check (max_rooms_per_property >= 0),
  max_beds_per_room integer not null default 0 check (max_beds_per_room >= 0),
  max_caretakers integer not null default 0 check (max_caretakers >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.subscription_plans_plan_id_seq
  owned by public.subscription_plans.plan_id;

alter table public.subscription_plans enable row level security;

insert into public.subscription_plans (
  code, name, description,
  max_properties, max_rooms_per_property, max_beds_per_room, max_caretakers,
  sort_order
)
select 'free', 'Free', 'Entry tier for new landlords.', 3, 3, 4, 1, 0
where not exists (
  select 1 from public.subscription_plans where code = 'free'
);

-- ---- 2. landlord_subscriptions ------------------------------------

create sequence if not exists public.landlord_subscriptions_subscription_id_seq
  as bigint start with 1 minvalue 1 increment by 1;

create table if not exists public.landlord_subscriptions (
  subscription_id bigint primary key
    default nextval('public.landlord_subscriptions_subscription_id_seq'),
  landlord_id bigint not null unique
    references public.user_accounts (legacy_user_id),
  plan_id bigint not null references public.subscription_plans (plan_id),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  assigned_by bigint references public.user_accounts (legacy_user_id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.landlord_subscriptions_subscription_id_seq
  owned by public.landlord_subscriptions.subscription_id;

create index if not exists landlord_subscriptions_plan_id_idx
  on public.landlord_subscriptions (plan_id);

alter table public.landlord_subscriptions enable row level security;

commit;

-- Verify:
--   select code, name, max_properties, max_rooms_per_property,
--          max_beds_per_room, max_caretakers, is_active
--   from public.subscription_plans order by sort_order;
--   -- free | Free | 3 | 3 | 4 | 1 | t


-- >>>>>>>>>>>>>>>>>>>>  0011_paymongo.sql  >>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 0011_paymongo  (Phase 11 — PayMongo plumbing)
-- ============================================================
-- Adds the columns/tables the PayMongo (hosted Checkout Sessions) integration
-- needs. Money settles into ONE platform PayMongo account; landlord payouts
-- are handled off-platform. Fully optional at runtime — with no PayMongo keys
-- the app ignores all of this and stays on the manual flows.
--
--   1. subscription_plans.price + billing_interval_days  (plans can now cost)
--   2. payments: link a payment to its checkout session / PayMongo payment
--   3. subscription_orders  — a landlord's checkout attempt for a plan
--   4. paymongo_events       — processed webhook event ids (idempotency)
--
-- RLS: the two new tables are enabled with no policy (service layer only).
-- ============================================================

begin;

-- ---- 1. priced plans --------------------------------------------------

alter table public.subscription_plans
  add column if not exists price numeric not null default 0
    check (price >= 0),
  add column if not exists billing_interval_days integer not null default 30
    check (billing_interval_days > 0);

-- ---- 2. payment <-> checkout session link ---------------------------

alter table public.payments
  add column if not exists paymongo_session_id text,
  add column if not exists paymongo_payment_id text,
  add column if not exists paid_channel text;

create index if not exists payments_paymongo_session_idx
  on public.payments (paymongo_session_id);

-- ---- 3. subscription_orders ---------------------------------------

create sequence if not exists public.subscription_orders_order_id_seq
  as bigint start with 1 minvalue 1 increment by 1;

create table if not exists public.subscription_orders (
  order_id bigint primary key
    default nextval('public.subscription_orders_order_id_seq'),
  landlord_id bigint not null
    references public.user_accounts (legacy_user_id),
  plan_id bigint not null references public.subscription_plans (plan_id),
  amount numeric not null default 0,
  currency text not null default 'PHP',
  interval_days integer not null default 30,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  paymongo_session_id text,
  paymongo_payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.subscription_orders_order_id_seq
  owned by public.subscription_orders.order_id;

create index if not exists subscription_orders_landlord_idx
  on public.subscription_orders (landlord_id);
create index if not exists subscription_orders_session_idx
  on public.subscription_orders (paymongo_session_id);

alter table public.subscription_orders enable row level security;

-- ---- 4. webhook idempotency -------------------------------------

create table if not exists public.paymongo_events (
  event_id text primary key,
  event_type text,
  processed_at timestamptz not null default now()
);

alter table public.paymongo_events enable row level security;

commit;


-- >>>>>>>>>>>>>>>>>>>>  0012_booking_payment_flow.sql  >>>>>>>>>>>>>>>>>>>>

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

