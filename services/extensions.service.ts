import 'server-only'

import { requireUser } from '@/lib/auth/dal'
import { primaryRole } from '@/lib/auth/roles'
import { isSuperadmin } from '@/lib/permissions/properties'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as extensionsRepo from '@/repositories/extensions.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import { requireOperableProperty } from '@/services/property-access'
import {
  estimateTotal,
  nightsBetween,
  type BookingPeriod,
} from '@/schemas/booking'
import {
  extensionDecisionSchema,
  requestExtensionSchema,
} from '@/schemas/extension'

const EXTENDABLE = new Set(['confirmed', 'checked_in'])

export type ExtensionItem = {
  extensionId: number
  bookingId: number
  previousCheckOut: string
  newCheckOut: string
  amount: number
  status: string
  tenantMessage: string | null
  managerResponse: string | null
  decidedAt: string | null
  decidedByName: string | null
  paymentId: number | null
  createdAt: string
  canCancel: boolean
}

async function statusCodeById(): Promise<Map<number, string>> {
  const statuses = await referenceRepo.listBookingStatuses()
  return new Map(statuses.map((s) => [s.booking_status_id, s.status_code]))
}

async function decorate(
  rows: extensionsRepo.ExtensionRow[],
  viewer: { legacyUserId: number; isManager: boolean },
): Promise<ExtensionItem[]> {
  if (rows.length === 0) return []
  const deciderIds = rows
    .map((r) => r.decided_by)
    .filter((id): id is number => id != null)
  const names = await bookingsRepo.tenantNamesByIds(deciderIds)

  return rows.map((r) => ({
    extensionId: r.extension_id,
    bookingId: r.booking_id,
    previousCheckOut: r.previous_check_out_date,
    newCheckOut: r.extended_check_out_date,
    amount: Number(r.amount),
    status: r.status,
    tenantMessage: r.tenant_message,
    managerResponse: r.manager_response,
    decidedAt: r.decided_at,
    decidedByName:
      r.decided_by != null ? (names.get(r.decided_by) ?? null) : null,
    paymentId: r.payment_id,
    createdAt: r.created_at,
    canCancel:
      !viewer.isManager &&
      r.status === 'pending' &&
      r.created_by === viewer.legacyUserId,
  }))
}

/* ------------------------------------------------------------------ *
 * Tenant
 * ------------------------------------------------------------------ */

export type ExtensionContext = {
  bookingId: number
  currentCheckOut: string
  statusCode: string | null
  canRequest: boolean
  period: BookingPeriod | null
  unitPrice: number | null
  hasPending: boolean
}

export async function getExtensionContext(
  bookingId: number,
): Promise<ExtensionContext> {
  const user = await requireUser()
  const booking = await bookingsRepo.getBooking(bookingId)
  if (
    !booking ||
    (booking.user_id !== user.legacyUserId && !isSuperadmin(user))
  ) {
    throw new ServiceError('Booking not found.', 'not_found')
  }

  const [codeById, snapshot, existing] = await Promise.all([
    statusCodeById(),
    bookingsRepo.getRateSnapshot(bookingId),
    extensionsRepo.listExtensionsByBooking(bookingId),
  ])
  const statusCode = booking.booking_status_id
    ? (codeById.get(booking.booking_status_id) ?? null)
    : null
  const hasPending = existing.some((e) => e.status === 'pending')

  return {
    bookingId,
    currentCheckOut: booking.check_out_date,
    statusCode,
    canRequest: statusCode != null && EXTENDABLE.has(statusCode) && !hasPending,
    period: (snapshot?.period as BookingPeriod | undefined) ?? null,
    unitPrice: snapshot ? Number(snapshot.price) : null,
    hasPending,
  }
}

export async function requestExtension(
  bookingId: number,
  input: unknown,
): Promise<number> {
  const user = await requireUser()
  if (!user.roles.includes('tenant') && !isSuperadmin(user)) {
    throw new ServiceError(
      'Only a tenant account can request an extension.',
      'forbidden',
    )
  }

  const booking = await bookingsRepo.getBooking(bookingId)
  if (
    !booking ||
    (booking.user_id !== user.legacyUserId && !isSuperadmin(user))
  ) {
    throw new ServiceError('Booking not found.', 'not_found')
  }

  const data = parseOrThrow(requestExtensionSchema, input)

  const codeById = await statusCodeById()
  const statusCode = booking.booking_status_id
    ? (codeById.get(booking.booking_status_id) ?? null)
    : null
  if (!statusCode || !EXTENDABLE.has(statusCode)) {
    throw new ServiceError(
      'This booking is not in a state that can be extended.',
      'conflict',
    )
  }

  if (new Date(data.new_check_out) <= new Date(booking.check_out_date)) {
    throw new ServiceError(
      'Choose a date after the current check-out.',
      'validation',
      { new_check_out: ['Choose a date after the current check-out.'] },
    )
  }

  const snapshot = await bookingsRepo.getRateSnapshot(bookingId)
  let amount = 0
  if (snapshot) {
    const extraNights = nightsBetween(
      booking.check_out_date,
      data.new_check_out,
    )
    amount = estimateTotal(
      snapshot.period as BookingPeriod,
      Number(snapshot.price),
      extraNights,
    ).total
  }

  return extensionsRepo.callCreateExtension({
    p_booking: bookingId,
    p_requested_by: user.legacyUserId,
    p_new_check_out: data.new_check_out,
    p_amount: amount,
    p_message: data.message ?? null,
  })
}

export async function getBookingExtensions(
  bookingId: number,
  viewer: 'tenant' | 'manager',
): Promise<ExtensionItem[]> {
  const user = await requireUser()
  return decorate(await extensionsRepo.listExtensionsByBooking(bookingId), {
    legacyUserId: user.legacyUserId,
    isManager: viewer === 'manager',
  })
}

export async function cancelMyExtension(extensionId: number): Promise<void> {
  const user = await requireUser()
  const ext = await extensionsRepo.getExtension(extensionId)
  if (!ext || (ext.created_by !== user.legacyUserId && !isSuperadmin(user))) {
    throw new ServiceError('Extension not found.', 'not_found')
  }
  await extensionsRepo.callSetExtensionStatus({
    p_extension: extensionId,
    p_actor: user.legacyUserId,
    p_actor_role: primaryRole(user.roles),
    p_to_code: 'cancelled',
    p_response: null,
  })
}

/* ------------------------------------------------------------------ *
 * Manager (landlord / caretaker / superadmin)
 * ------------------------------------------------------------------ */

export async function decideExtension(
  extensionId: number,
  input: unknown,
): Promise<void> {
  const user = await requireUser()
  const ext = await extensionsRepo.getExtension(extensionId)
  if (!ext) throw new ServiceError('Extension not found.', 'not_found')

  const booking = await bookingsRepo.getBooking(ext.booking_id)
  if (!booking) throw new ServiceError('Extension not found.', 'not_found')
  await requireOperableProperty(booking.property_id)

  const { to, response } = parseOrThrow(extensionDecisionSchema, input)

  await extensionsRepo.callSetExtensionStatus({
    p_extension: extensionId,
    p_actor: user.legacyUserId,
    p_actor_role: primaryRole(user.roles),
    p_to_code: to,
    p_response: response ?? null,
  })
}
