import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type MessageRow = Tables<'chat_messages'>
export type InquiryRow = Tables<'property_inquiries'>
export type NotificationRow = Tables<'notifications'>

/* ------------------------------------------------------------------ *
 * Chat messages
 * ------------------------------------------------------------------ */

export async function listConversation(
  userA: number,
  userB: number,
  propertyId: number | null,
): Promise<MessageRow[]> {
  let query = createAdminClient()
    .from('chat_messages')
    .select('*')
    .or(
      `and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`,
    )
    .order('created_at', { ascending: true })
  query =
    propertyId === null
      ? query.is('property_id', null)
      : query.eq('property_id', propertyId)

  const { data, error } = await query
  if (error) throw new RepositoryError('Failed to load messages.', error)
  return data ?? []
}

export async function listMessagesForUser(
  userId: number,
): Promise<MessageRow[]> {
  const { data, error } = await createAdminClient()
    .from('chat_messages')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load messages.', error)
  return data ?? []
}

export async function insertMessage(values: {
  sender_id: number
  receiver_id: number
  property_id: number | null
  message: string
  reply_to_message_id: number | null
}): Promise<MessageRow> {
  const { data, error } = await createAdminClient()
    .from('chat_messages')
    .insert(values)
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to send message.', error)
  return data
}

export async function getMessage(id: number): Promise<MessageRow | null> {
  const { data, error } = await createAdminClient()
    .from('chat_messages')
    .select('*')
    .eq('message_id', id)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load message.', error)
  return data
}

export async function updateMessageBody(
  id: number,
  message: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('chat_messages')
    .update({ message, is_edited: true, edited_at: new Date().toISOString() })
    .eq('message_id', id)
  if (error) throw new RepositoryError('Failed to edit message.', error)
}

export async function markConversationRead(
  reader: number,
  otherUser: number,
  propertyId: number | null,
): Promise<void> {
  let query = createAdminClient()
    .from('chat_messages')
    .update({ is_read: true })
    .eq('receiver_id', reader)
    .eq('sender_id', otherUser)
    .eq('is_read', false)
  query =
    propertyId === null
      ? query.is('property_id', null)
      : query.eq('property_id', propertyId)
  const { error } = await query
  if (error) throw new RepositoryError('Failed to mark read.', error)
}

/* ------------------------------------------------------------------ *
 * Property inquiries
 * ------------------------------------------------------------------ */

export async function listInquiriesForTenant(
  tenantId: number,
): Promise<InquiryRow[]> {
  const { data, error } = await createAdminClient()
    .from('property_inquiries')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load inquiries.', error)
  return data ?? []
}

export async function listInquiriesForProperties(
  propertyIds: number[],
): Promise<InquiryRow[]> {
  if (propertyIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('property_inquiries')
    .select('*')
    .in('property_id', propertyIds)
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load inquiries.', error)
  return data ?? []
}

export async function getInquiry(id: number): Promise<InquiryRow | null> {
  const { data, error } = await createAdminClient()
    .from('property_inquiries')
    .select('*')
    .eq('inquiry_id', id)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load inquiry.', error)
  return data
}

export async function insertInquiry(values: {
  property_id: number
  tenant_id: number
  landlord_id: number
  subject: string
  message: string
}): Promise<InquiryRow> {
  const { data, error } = await createAdminClient()
    .from('property_inquiries')
    .insert({ ...values, status: 'new' })
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to submit inquiry.', error)
  return data
}

export async function updateInquiry(
  id: number,
  patch: Partial<InquiryRow>,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('property_inquiries')
    .update(patch)
    .eq('inquiry_id', id)
  if (error) throw new RepositoryError('Failed to update inquiry.', error)
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

export async function listNotifications(
  userId: number,
  limit = 100,
): Promise<NotificationRow[]> {
  const { data, error } = await createAdminClient()
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new RepositoryError('Failed to load notifications.', error)
  return data ?? []
}

export async function countUnreadNotifications(
  userId: number,
): Promise<number> {
  const { count, error } = await createAdminClient()
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) throw new RepositoryError('Failed to count notifications.', error)
  return count ?? 0
}

export async function markNotificationRead(
  userId: number,
  id: number,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('notification_id', id)
    .eq('user_id', userId)
  if (error) throw new RepositoryError('Failed to update notification.', error)
}

export async function markAllNotificationsRead(userId: number): Promise<void> {
  const { error } = await createAdminClient()
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) throw new RepositoryError('Failed to update notifications.', error)
}

export async function notify(values: {
  user_id: number
  notification_type: string
  title: string
  message: string
  reference_type?: string
  reference_id?: number
}): Promise<void> {
  const { error } = await createAdminClient()
    .from('notifications')
    .insert(values)
  if (error) throw new RepositoryError('Failed to create notification.', error)
}

/* ------------------------------------------------------------------ *
 * Relationship check (message authorization)
 * ------------------------------------------------------------------ */

export async function tenantIsLinkedToProperty(
  tenantId: number,
  propertyId: number,
): Promise<boolean> {
  const admin = createAdminClient()
  const [b, i] = await Promise.all([
    admin
      .from('bookings')
      .select('booking_id', { count: 'exact', head: true })
      .eq('user_id', tenantId)
      .eq('property_id', propertyId),
    admin
      .from('property_inquiries')
      .select('inquiry_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('property_id', propertyId),
  ])
  if (b.error)
    throw new RepositoryError('Failed to check relationship.', b.error)
  if (i.error)
    throw new RepositoryError('Failed to check relationship.', i.error)
  return (b.count ?? 0) > 0 || (i.count ?? 0) > 0
}
