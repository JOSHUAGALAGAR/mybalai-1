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
