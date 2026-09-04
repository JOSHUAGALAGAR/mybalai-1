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
