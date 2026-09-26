import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type BookingRow = Tables<'bookings'>
export type BookingStatusHistoryRow = Tables<'booking_status_history'>

export async function getBooking(
  bookingId: number,
): Promise<BookingRow | null> {
  const { data, error } = await createAdminClient()
    .from('bookings')
    .select('*')
    .eq('booking_id', bookingId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load booking.', error)
  return data
}

export async function listBookingsByUser(
  userId: number,
): Promise<BookingRow[]> {
  const { data, error } = await createAdminClient()
    .from('bookings')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('submission_date', { ascending: false })
  if (error) throw new RepositoryError('Failed to load bookings.', error)
  return data ?? []
}

export async function listBookingsByProperties(
  propertyIds: number[],
  options: { statusId?: number } = {},
): Promise<BookingRow[]> {
  if (propertyIds.length === 0) return []
  let query = createAdminClient()
    .from('bookings')
    .select('*')
    .in('property_id', propertyIds)
    .is('deleted_at', null)
    .order('submission_date', { ascending: false })
  if (options.statusId !== undefined) {
    query = query.eq('booking_status_id', options.statusId)
  }
  const { data, error } = await query
  if (error) throw new RepositoryError('Failed to load bookings.', error)
  return data ?? []
}

/** Whose bookings a manager may list: their own properties, a caretaker's assigned ones, or everyone's (superadmin). */
export type ManagerScope =
  | { kind: 'owner'; ownerId: number }
  | { kind: 'properties'; propertyIds: number[] }
  | { kind: 'all' }

/** The most a manager list loads at once (newest first) — a list is never allowed to grow without bound. */
export const MANAGER_LIST_LIMIT = 300

/**
 * A manager's bookings in ONE query. The owner filter is applied in the database (through the
 * property), so a landlord with hundreds of bookings no longer means "download every property id,
 * then send them all back in a giant URL".
 */
export async function listBookingsForManager(
  scope: ManagerScope,
  options: { statusId?: number; limit?: number } = {},
): Promise<BookingRow[]> {
  if (scope.kind === 'properties' && scope.propertyIds.length === 0) return []
  const admin = createAdminClient()
  let query =
    scope.kind === 'owner'
      ? admin
          .from('bookings')
          .select('*, properties!inner(property_owner)')
          .eq('properties.property_owner', scope.ownerId)
      : admin.from('bookings').select('*')
  if (scope.kind === 'properties')
    query = query.in('property_id', scope.propertyIds)
  query = query
    .is('deleted_at', null)
    .order('submission_date', { ascending: false })
    .limit(options.limit ?? MANAGER_LIST_LIMIT)
  if (options.statusId !== undefined) {
    query = query.eq('booking_status_id', options.statusId)
  }
  const { data, error } = await query
  if (error) throw new RepositoryError('Failed to load bookings.', error)
  return (
    (data ?? []) as unknown as (BookingRow & { properties?: unknown })[]
  ).map(({ properties: _joined, ...row }) => {
    void _joined
    return row as BookingRow
  })
}

/** Confirmed / checked-in bookings holding `bedId` — for availability checks. */
export async function listBlockingBookingsForBed(
  bedId: number,
  blockingStatusIds: number[],
  options: { excludeBookingId?: number } = {},
): Promise<{ check_in_date: string; check_out_date: string }[]> {
  const admin = createAdminClient()
  const { data: allocs, error: allocErr } = await admin
    .from('booking_beds')
    .select('booking_id')
    .eq('bed_id', bedId)
  if (allocErr)
    throw new RepositoryError('Failed to check availability.', allocErr)

  const bookingIds = (allocs ?? [])
    .map((a) => a.booking_id)
    .filter((id) => id !== options.excludeBookingId)
  if (bookingIds.length === 0 || blockingStatusIds.length === 0) return []

  const { data, error } = await admin
    .from('bookings')
    .select('check_in_date, check_out_date')
    .in('booking_id', bookingIds)
    .in('booking_status_id', blockingStatusIds)
    .is('deleted_at', null)
  if (error) throw new RepositoryError('Failed to check availability.', error)
  return data ?? []
}

export async function getRateSnapshot(
  bookingId: number,
): Promise<Tables<'booking_rate_snapshots'> | null> {
  const { data, error } = await createAdminClient()
    .from('booking_rate_snapshots')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load rate snapshot.', error)
  return data
}

export async function listStatusHistory(
  bookingId: number,
): Promise<BookingStatusHistoryRow[]> {
  const { data, error } = await createAdminClient()
    .from('booking_status_history')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
  if (error) throw new RepositoryError('Failed to load booking history.', error)
  return data ?? []
}

/* ---- transactional RPCs (see migration 0006) ---- */

export async function callCreateBooking(args: {
  p_user: number
  p_property: number
  p_room: number
  p_bed: number
  p_rate: number | null
  p_check_in: string
  p_check_out: string
  p_message: string | null
  p_total: number
  p_period: string
  p_price: number
  p_rate_valid_from: string | null
  p_rate_valid_until: string | null
  p_advance?: number
  p_deposit?: number
}): Promise<number> {
  const { data, error } = await createAdminClient().rpc('create_booking', args)
  if (error) throw new RepositoryError(mapDbError(error), error)
  return data as number
}

export async function callSetBookingStatus(args: {
  p_booking: number
  p_actor: number
  p_actor_role: string
  p_to_code: string
  p_response: string | null
}): Promise<string> {
  const { data, error } = await createAdminClient().rpc(
    'set_booking_status',
    args,
  )
  if (error) throw new RepositoryError(mapDbError(error), error)
  return data as string
}

/**
 * Expire payment_pending bookings past their deadline (releases the bed hold).
 * Pass a booking id to sweep just one, or omit to sweep all overdue. Safe to
 * call on every read — it is one indexed UPDATE loop.
 */
// A full sweep is also run on a schedule where pg_cron is available, so paying a
// database round-trip on EVERY list read is wasteful. At most one per interval per
// server instance; a single-booking sweep (detail view) is never skipped.
const SWEEP_MIN_INTERVAL_MS = 30_000
let lastFullSweepAt = 0

export async function callExpireOverdueBookings(
  bookingId?: number,
): Promise<number> {
  if (bookingId == null) {
    const now = Date.now()
    if (now - lastFullSweepAt < SWEEP_MIN_INTERVAL_MS) return 0
    lastFullSweepAt = now
  }
  const { data, error } = await createAdminClient().rpc(
    'expire_overdue_bookings',
    bookingId != null ? { p_booking: bookingId } : {},
  )
  if (error) {
    // Never block a page read on the sweep; log and move on.
    console.error('[bookings] expire sweep failed:', error)
    return 0
  }
  return (data as number) ?? 0
}

/* ---- batch label lookups for list/detail decoration ---- */

export async function propertyNamesByIds(
  ids: number[],
): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await createAdminClient()
    .from('properties')
    .select('property_id, property_name')
    .in('property_id', [...new Set(ids)])
  if (error) throw new RepositoryError('Failed to load properties.', error)
  return new Map((data ?? []).map((r) => [r.property_id, r.property_name]))
}

export async function roomLabelsByIds(
  ids: number[],
): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await createAdminClient()
    .from('rooms')
    .select('room_id, room_name, room_number')
    .in('room_id', [...new Set(ids)])
  if (error) throw new RepositoryError('Failed to load rooms.', error)
  return new Map(
    (data ?? []).map((r) => [
      r.room_id,
      r.room_name || r.room_number
        ? [r.room_name, r.room_number].filter(Boolean).join(' · ')
        : `Room #${r.room_id}`,
    ]),
  )
}

export async function bedNumbersByIds(
  ids: number[],
): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await createAdminClient()
    .from('beds')
    .select('bed_id, bed_number')
    .in('bed_id', [...new Set(ids)])
  if (error) throw new RepositoryError('Failed to load beds.', error)
  return new Map((data ?? []).map((r) => [r.bed_id, r.bed_number]))
}

export async function tenantNamesByIds(
  ids: number[],
): Promise<Map<number, string | null>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await createAdminClient()
    .from('user_accounts')
    .select('legacy_user_id, full_name')
    .in('legacy_user_id', [...new Set(ids)])
  if (error) throw new RepositoryError('Failed to load tenants.', error)
  return new Map((data ?? []).map((r) => [r.legacy_user_id, r.full_name]))
}

function mapDbError(error: { code?: string; message?: string }): string {
  if (error.code === '23P01') {
    return 'That bed is already booked for the selected dates.'
  }
  if (error.code === '22023') {
    return error.message ?? 'That change is not allowed for this booking.'
  }
  return 'The booking could not be updated. Please try again.'
}

/** Who holds (or will hold) beds in a room: confirmed / checked-in bookings, minus one booking. */
export async function listBlockingBookingsForRoom(
  roomId: number,
  blockingStatusIds: number[],
  options: { excludeBookingId?: number } = {},
): Promise<
  {
    booking_id: number
    user_id: number
    check_in_date: string
    check_out_date: string
  }[]
> {
  if (blockingStatusIds.length === 0) return []
  let query = createAdminClient()
    .from('bookings')
    .select('booking_id, user_id, check_in_date, check_out_date')
    .eq('room_id', roomId)
    .in('booking_status_id', blockingStatusIds)
    .is('deleted_at', null)
  if (options.excludeBookingId !== undefined) {
    query = query.neq('booking_id', options.excludeBookingId)
  }
  const { data, error } = await query
  if (error)
    throw new RepositoryError('Failed to load the room occupants.', error)
  return data ?? []
}
