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
