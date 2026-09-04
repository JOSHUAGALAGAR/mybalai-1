import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type ExtensionRow = Tables<'booking_extensions'>

export async function getExtension(
  extensionId: number,
): Promise<ExtensionRow | null> {
  const { data, error } = await createAdminClient()
    .from('booking_extensions')
    .select('*')
    .eq('extension_id', extensionId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the extension.', error)
  return data
}

export async function listExtensionsByBooking(
  bookingId: number,
): Promise<ExtensionRow[]> {
  const { data, error } = await createAdminClient()
    .from('booking_extensions')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
  if (error) throw new RepositoryError('Failed to load extensions.', error)
  return data ?? []
}

export async function listExtensionsByBookings(
  bookingIds: number[],
): Promise<ExtensionRow[]> {
  if (bookingIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('booking_extensions')
    .select('*')
    .in('booking_id', [...new Set(bookingIds)])
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load extensions.', error)
  return data ?? []
}

/* ---- transactional RPCs (see migration 0009) ---- */

export async function callCreateExtension(args: {
  p_booking: number
  p_requested_by: number
  p_new_check_out: string
  p_amount: number
  p_message: string | null
}): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    'create_booking_extension',
    args,
  )
  if (error) throw new RepositoryError(mapDbError(error), error)
  return data as number
}

export async function callSetExtensionStatus(args: {
  p_extension: number
  p_actor: number
  p_actor_role: string
  p_to_code: string
  p_response: string | null
}): Promise<string> {
  const { data, error } = await createAdminClient().rpc(
    'set_booking_extension_status',
    args,
  )
  if (error) throw new RepositoryError(mapDbError(error), error)
  return data as string
}

function mapDbError(error: { code?: string; message?: string }): string {
  if (error.code === '23P01') {
    return 'The extended dates overlap another booking for this bed.'
  }
  if (error.code === '22023') {
    return error.message ?? 'That change is not allowed for this extension.'
  }
  return 'The extension could not be updated. Please try again.'
}
