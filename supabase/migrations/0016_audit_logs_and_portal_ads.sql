-- ============================================================
-- 0016_audit_logs_and_portal_ads
-- ============================================================
-- The baseline schema ALREADY has both tables (audit_logs with entity_type / entity_id / metadata;
-- portal_ads with message / storage_path / target_roles). This migration keeps them and only adds
-- what the admin console needs:
--
-- 1. audit_logs: make it append-only (history cannot be rewritten or deleted) and add indexes for
--    the log's filters. The app writes its readable description and the actor's name into `metadata`
--    ({"summary": "...", "actor_name": "..."}); rows written by the database itself (e.g.
--    "payment_created") keep working and are described from action + entity_type + entity_id.
-- 2. portal_ads: add `link_label` (button text) and `updated_at`, and create a PUBLIC `portal-ads`
--    bucket for ad pictures (uploaded with server-issued signed URLs, so no Storage policy needed).
--    `target_roles` is stored as comma-separated role codes: "tenant,landlord".
--
-- Idempotent — safe to re-run. Apply in the Supabase SQL editor.
-- ============================================================

begin;

-- ---- audit log -------------------------------------------------------------------
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc, audit_log_id desc);
create index if not exists audit_logs_action_idx  on public.audit_logs (action, created_at desc);
create index if not exists audit_logs_actor_idx   on public.audit_logs (actor_id, created_at desc);

create or replace function public.audit_logs_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end
$$;
drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- ---- portal ads -------------------------------------------------------------------
alter table public.portal_ads add column if not exists link_label text;
alter table public.portal_ads add column if not exists updated_at timestamptz;
create index if not exists portal_ads_live_idx on public.portal_ads (is_active, starts_at, ends_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-ads', 'portal-ads', true, 3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

commit;

-- Verify:
--   select column_name from information_schema.columns where table_name = 'portal_ads' and column_name in ('link_label','updated_at');
--   select id, public from storage.buckets where id = 'portal-ads';
