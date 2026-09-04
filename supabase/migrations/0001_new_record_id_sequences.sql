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
