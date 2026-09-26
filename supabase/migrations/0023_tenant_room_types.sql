-- ============================================================
-- 0023_tenant_room_types
-- ============================================================
-- Matching preferences used a made-up "solo / shared" kind of room. Rooms are already categorised by
-- the landlord's room types (Single, Double, Triple, Quad, Family, Shared, Studio), so a tenant now
-- chooses from THOSE — one list of categories everywhere.
--
--   tenant_preferences.room_type_ids  integer[]  the room types the tenant would take ({} = any)
--   tenant_preferences.room_kind      dropped (its value is carried over first)
--
-- Idempotent: safe to run twice.
-- ============================================================

begin;

alter table public.tenant_preferences
  add column if not exists room_type_ids integer[] not null default '{}';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_preferences' and column_name = 'room_kind'
  ) then
    -- solo -> the one-person types, shared -> the types for two or more
    update public.tenant_preferences p
    set room_type_ids = coalesce((
      select array_agg(t.room_type_id order by t.room_type_id)
      from public.room_types t
      where (p.room_kind = 'solo' and coalesce(t.max_occupants, 1) <= 1)
         or (p.room_kind = 'shared' and coalesce(t.max_occupants, 1) > 1)
    ), '{}')
    where p.room_kind <> 'any' and p.room_type_ids = '{}';

    alter table public.tenant_preferences drop column room_kind;
  end if;
end $$;

commit;

-- Verify:
--   select column_name from information_schema.columns where table_name = 'tenant_preferences' and column_name in ('room_type_ids', 'room_kind');
