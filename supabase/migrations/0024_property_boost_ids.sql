-- ============================================================
-- 0024_property_boost_ids
-- ============================================================
-- Buying a boost failed with:
--   null value in column "boost_id" of relation "property_boosts" violates not-null constraint
--
-- Like the other baseline tables (see 0001 / 0004), `property_boosts.boost_id` is a plain BIGINT with
-- NO default (it keeps legacy MySQL ids). Nothing created a boost row until the PayMongo boost
-- purchase, so nobody noticed. This gives it the same sequence-backed default the other tables have.
--
-- Idempotent: safe to run twice. Existing rows (if any) are stepped over.
-- ============================================================

begin;

create sequence if not exists public.property_boosts_boost_id_seq
  as bigint
  start with 1000000
  minvalue 1000000
  increment by 1
  owned by public.property_boosts.boost_id;

alter table public.property_boosts
  alter column boost_id
  set default nextval('public.property_boosts_boost_id_seq');

select setval(
  'public.property_boosts_boost_id_seq',
  greatest((select coalesce(max(boost_id), 0) from public.property_boosts), 1000000),
  true
);

commit;

-- Verify (should show a nextval(...) default):
--   select column_default from information_schema.columns
--   where table_name = 'property_boosts' and column_name = 'boost_id';
