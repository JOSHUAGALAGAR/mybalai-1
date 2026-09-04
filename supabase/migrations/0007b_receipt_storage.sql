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
