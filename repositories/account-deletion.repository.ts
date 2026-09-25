import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'

const db = () => createAdminClient()
const fail = (what: string) => (error: unknown) => {
  throw new RepositoryError(`Failed to ${what}.`, error)
}

/** Bookings that are still in progress — a tenant's own, or those on a landlord's properties. */
export async function countActiveBookings(
  who: { tenantId: number } | { landlordId: number },
  activeStatusIds: number[],
): Promise<number> {
  if (activeStatusIds.length === 0) return 0
  let query = db()
    .from('bookings')
    .select('booking_id', { count: 'exact', head: true })
    .in('booking_status_id', activeStatusIds)
    .is('deleted_at', null)
  if ('tenantId' in who) {
    query = query.eq('user_id', who.tenantId)
  } else {
    const ids = await listOwnedPropertyIds(who.landlordId)
    if (ids.length === 0) return 0
    query = query.in('property_id', ids)
  }
  const { count, error } = await query
  if (error) fail('check your bookings')(error)
  return count ?? 0
}

export async function listOwnedPropertyIds(ownerId: number): Promise<number[]> {
  const { data, error } = await db()
    .from('properties')
    .select('property_id')
    .eq('property_owner', ownerId)
    .is('deleted_at', null)
  if (error) fail('list your properties')(error)
  return (data ?? []).map((p) => p.property_id)
}

export async function listIdFilePaths(userId: number): Promise<string[]> {
  const { data, error } = await db()
    .from('identity_verifications')
    .select('front_path, back_path')
    .eq('user_id', userId)
  // The table may not exist yet (migration 0015): then there is nothing to remove.
  if (error) return []
  return (data ?? []).flatMap((r) => [r.front_path, r.back_path])
}

async function deleteWhere(
  table: string,
  column: string,
  value: number,
  what: string,
) {
  // `table` / `column` are fixed strings in this file, never user input.
  const { error } = await db()
    .from(table as 'notifications')
    .delete()
    .eq(column as 'user_id', value)
  if (error) fail(what)(error)
}

export const deleteIdVerifications = (userId: number) =>
  deleteWhere(
    'identity_verifications',
    'user_id',
    userId,
    'remove your ID records',
  ).catch(() => {})
export const deleteNotifications = (userId: number) =>
  deleteWhere('notifications', 'user_id', userId, 'remove your notifications')
export const deleteMessagesSentBy = (userId: number) =>
  deleteWhere('chat_messages', 'sender_id', userId, 'remove your messages')
export const deleteInquiriesBy = (userId: number) =>
  deleteWhere(
    'property_inquiries',
    'tenant_id',
    userId,
    'remove your inquiries',
  )
export const deleteReviewsBy = (userId: number) =>
  deleteWhere('property_ratings', 'user_id', userId, 'remove your reviews')
export const deleteTenantProfile = (userId: number) =>
  deleteWhere(
    'tenant_profiles',
    'legacy_user_id',
    userId,
    'remove your profile',
  )
export const deleteLandlordProfile = (userId: number) =>
  deleteWhere(
    'landlord_profiles',
    'legacy_user_id',
    userId,
    'remove your profile',
  )

export async function cancelSubscriptions(landlordId: number): Promise<void> {
  const { error } = await db()
    .from('landlord_subscriptions')
    .update({ status: 'cancelled', ends_at: new Date().toISOString() })
    .eq('landlord_id', landlordId)
    .neq('status', 'cancelled')
  if (error) fail('cancel your subscription')(error)
}

/**
 * The point of no return: scrub the personal data from the account row and cut its link to the
 * login. Bookings and payments keep pointing at this row (accounting records), but it no longer
 * holds a name, email, phone, address or photo.
 */
export async function anonymizeAccount(userId: number): Promise<void> {
  const { error } = await db()
    .from('user_accounts')
    .update({
      full_name: 'Deleted user',
      email: null,
      username: null,
      phone: null,
      address: null,
      avatar_url: null,
      auth_user_id: null,
      is_active: false,
    })
    .eq('legacy_user_id', userId)
  if (error) fail('close your account')(error)
  // Older databases may not have this column yet — the badge goes with the account either way.
  await db()
    .from('user_accounts')
    .update({ id_verified_at: null })
    .eq('legacy_user_id', userId)
}

/** Delete the login itself (this signs the person out everywhere). */
export async function deleteAuthUser(authUserId: string): Promise<void> {
  const { error } = await db().auth.admin.deleteUser(authUserId)
  if (error) fail('remove your login')(error)
}
