import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  MANAGER_LIST_LIMIT,
  type ManagerScope,
} from '@/repositories/bookings.repository'
import { RepositoryError } from '@/repositories/reference.repository'
import { RECEIPT_BUCKET } from '@/schemas/payment'
import type { Tables } from '@/types/database'

export type PaymentRow = Tables<'payments'>
export type PaymentNoteRow = Tables<'payment_notes'>
export type PaymentReplyRow = Tables<'payment_note_replies'>
export type PaymentReceiptRow = Tables<'payment_receipts'>
export type PaymentStatusHistoryRow = Tables<'payment_status_history'>

/* ---- reads ---- */

export async function getPayment(
  paymentId: number,
): Promise<PaymentRow | null> {
  const { data, error } = await createAdminClient()
    .from('payments')
    .select('*')
    .eq('payment_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load payment.', error)
  return data
}

export async function listPaymentsByUser(
  userId: number,
): Promise<PaymentRow[]> {
  const { data, error } = await createAdminClient()
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load payments.', error)
  return data ?? []
}

export async function listPaymentsByBookings(
  bookingIds: number[],
  options: { statusId?: number } = {},
): Promise<PaymentRow[]> {
  if (bookingIds.length === 0) return []
  let query = createAdminClient()
    .from('payments')
    .select('*')
    .in('booking_id', bookingIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (options.statusId !== undefined) {
    query = query.eq('payment_status_id', options.statusId)
  }
  const { data, error } = await query
  if (error) throw new RepositoryError('Failed to load payments.', error)
  return data ?? []
}

/** A manager's payments in ONE query (see `listBookingsForManager`): filtered by owner in the database. */
export async function listPaymentsForManager(
  scope: ManagerScope,
  options: { statusId?: number; limit?: number } = {},
): Promise<PaymentRow[]> {
  if (scope.kind === 'properties' && scope.propertyIds.length === 0) return []
  const admin = createAdminClient()
  let query =
    scope.kind === 'owner'
      ? admin
          .from('payments')
          .select('*, bookings!inner(properties!inner(property_owner))')
          .eq('bookings.properties.property_owner', scope.ownerId)
      : scope.kind === 'properties'
        ? admin
            .from('payments')
            .select('*, bookings!inner(property_id)')
            .in('bookings.property_id', scope.propertyIds)
        : admin.from('payments').select('*')
  query = query
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? MANAGER_LIST_LIMIT)
  if (options.statusId !== undefined) {
    query = query.eq('payment_status_id', options.statusId)
  }
  const { data, error } = await query
  if (error) throw new RepositoryError('Failed to load payments.', error)
  return (
    (data ?? []) as unknown as (PaymentRow & { bookings?: unknown })[]
  ).map(({ bookings: _joined, ...row }) => {
    void _joined
    return row as PaymentRow
  })
}

export async function bookingRefsByIds(
  ids: number[],
): Promise<
  Map<number, { property_id: number; room_id: number; user_id: number }>
> {
  if (ids.length === 0) return new Map()
  const { data, error } = await createAdminClient()
    .from('bookings')
    .select('booking_id, property_id, room_id, user_id')
    .in('booking_id', [...new Set(ids)])
  if (error) throw new RepositoryError('Failed to load bookings.', error)
  return new Map(
    (data ?? []).map((b) => [
      b.booking_id,
      { property_id: b.property_id, room_id: b.room_id, user_id: b.user_id },
    ]),
  )
}

export async function listStatusHistory(
  paymentId: number,
): Promise<PaymentStatusHistoryRow[]> {
  const { data, error } = await createAdminClient()
    .from('payment_status_history')
    .select('*')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: true })
  if (error) throw new RepositoryError('Failed to load payment history.', error)
  return data ?? []
}

export async function listNotes(paymentId: number): Promise<PaymentNoteRow[]> {
  const { data, error } = await createAdminClient()
    .from('payment_notes')
    .select('*')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: true })
  if (error) throw new RepositoryError('Failed to load notes.', error)
  return data ?? []
}

export async function listReplies(
  paymentId: number,
): Promise<PaymentReplyRow[]> {
  const { data, error } = await createAdminClient()
    .from('payment_note_replies')
    .select('*')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: true })
  if (error) throw new RepositoryError('Failed to load replies.', error)
  return data ?? []
}

export async function listReceipts(
  paymentId: number,
): Promise<PaymentReceiptRow[]> {
  const { data, error } = await createAdminClient()
    .from('payment_receipts')
    .select('*')
    .eq('payment_id', paymentId)
    .order('uploaded_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load receipts.', error)
  return data ?? []
}

export async function signedReceiptUrl(
  storagePath: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .storage.from(RECEIPT_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error) return null
  return data?.signedUrl ?? null
}

/* ---- writes ---- */

export async function resolveMethodId(code: string): Promise<number | null> {
  const { data, error } = await createAdminClient()
    .from('payment_methods')
    .select('payment_method_id')
    .eq('method_code', code)
    .maybeSingle()
  if (error)
    throw new RepositoryError('Failed to resolve payment method.', error)
  return data?.payment_method_id ?? null
}

export async function insertNote(values: {
  payment_id: number
  author_id: number
  author_role: string
  note: string
}): Promise<void> {
  const { error } = await createAdminClient()
    .from('payment_notes')
    .insert(values)
  if (error) throw new RepositoryError('Failed to add note.', error)
}

export async function insertReply(values: {
  payment_id: number
  author_id: number
  author_role: string
  reply: string
}): Promise<void> {
  const { error } = await createAdminClient()
    .from('payment_note_replies')
    .insert(values)
  if (error) throw new RepositoryError('Failed to add reply.', error)
}

export async function insertReceipt(values: {
  payment_id: number
  storage_path: string
  original_filename: string | null
  mime_type: string | null
  file_size: number | null
  uploaded_by: number
}): Promise<void> {
  const { error } = await createAdminClient()
    .from('payment_receipts')
    .insert(values)
  if (error) throw new RepositoryError('Failed to record the receipt.', error)
}

/* ---- transactional RPCs (migration 0007) ---- */

export async function callCreatePayment(args: {
  p_user: number
  p_created_by: number
  p_created_by_role: string
  p_booking: number | null
  p_amount: number
  p_method: number | null
  p_reference: string | null
  p_paid_at: string | null
  p_note: string | null
}): Promise<number> {
  const { data, error } = await createAdminClient().rpc('create_payment', args)
  if (error) throw new RepositoryError(mapDbError(error), error)
  return data as number
}

export async function callSetPaymentStatus(args: {
  p_payment: number
  p_actor: number
  p_actor_role: string
  p_to_code: string
  p_note: string | null
}): Promise<string> {
  const { data, error } = await createAdminClient().rpc(
    'set_payment_status',
    args,
  )
  if (error) throw new RepositoryError(mapDbError(error), error)
  return data as string
}

/** Mark a PAID payment refunded and reverse the landlord's earning. Returns the database's verdict. */
export async function callRefundPayment(args: {
  p_payment: number
  p_actor: number | null
  p_note: string | null
}): Promise<string> {
  const { data, error } = await createAdminClient().rpc('refund_payment', args)
  if (error)
    throw new RepositoryError('The refund could not be recorded.', error)
  return data as string
}

function mapDbError(error: { code?: string; message?: string }): string {
  if (error.code === '22023') {
    return error.message ?? 'That change is not allowed for this payment.'
  }
  return 'The payment could not be updated. Please try again.'
}
