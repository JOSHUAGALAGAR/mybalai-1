import 'server-only'

import { requireUser } from '@/lib/auth/dal'
import { isSuperadmin } from '@/lib/permissions/properties'
import { primaryRole } from '@/lib/auth/roles'
import * as bedsRepo from '@/repositories/beds.repository'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as caretakersRepo from '@/repositories/caretakers.repository'
import * as discoveryRepo from '@/repositories/discovery.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import { requireOperableProperty } from '@/services/property-access'
import {
  bookingActionSchema,
  bookingCharges,
  createBookingSchema,
  nightsBetween,
  type BookingPeriod,
  type BookingTransition,
} from '@/schemas/booking'

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  // half-open ranges [start, end)
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd)
}

function allowedTransitions(statusCode: string | null): BookingTransition[] {
  switch (statusCode) {
    case 'pending':
      return ['payment_pending', 'rejected', 'cancelled']
    case 'payment_pending':
      return ['rejected', 'cancelled']
    case 'confirmed':
      return ['checked_in', 'cancelled']
    case 'checked_in':
      return ['checked_out']
    default:
      return []
  }
}

async function blockingStatusIds(): Promise<number[]> {
  const statuses = await referenceRepo.listBookingStatuses()
  return statuses
    .filter((s) => s.is_inventory_blocking)
    .map((s) => s.booking_status_id)
}

/**
 * Run the overdue-booking sweep alongside a read (they used to run back to back,
 * ~300 ms each) and re-read only if the sweep actually expired something.
 */
async function readAfterSweep<T>(
  read: () => Promise<T>,
  bookingId?: number,
): Promise<T> {
  const [swept, result] = await Promise.all([
    bookingsRepo.callExpireOverdueBookings(bookingId),
    read(),
  ])
  return swept > 0 ? read() : result
}

export type BookingListItem = {
  bookingId: number
  propertyId: number
  propertyName: string
  roomLabel: string
  bedNumber: string | null
  checkIn: string
  checkOut: string
  statusCode: string | null
  statusName: string | null
  totalAmount: number
  currency: string
  submittedAt: string
  tenantName?: string | null
  /** Only set for manager views (`withTenant`). */
  tenantId?: number
}

async function decorate(
  rows: bookingsRepo.BookingRow[],
  options: { withTenant?: boolean } = {},
): Promise<BookingListItem[]> {
  if (rows.length === 0) return []
  const [propNames, roomLabels, bedNumbers, statuses, tenantNames] =
    await Promise.all([
      bookingsRepo.propertyNamesByIds(rows.map((r) => r.property_id)),
      bookingsRepo.roomLabelsByIds(rows.map((r) => r.room_id)),
      bookingsRepo.bedNumbersByIds(
        rows.map((r) => r.bed_id).filter((id): id is number => id != null),
      ),
      referenceRepo.listBookingStatuses(),
      options.withTenant
        ? bookingsRepo.tenantNamesByIds(rows.map((r) => r.user_id))
        : Promise.resolve(new Map<number, string | null>()),
    ])

  const statusById = new Map(
    statuses.map((s) => [
      s.booking_status_id,
      { code: s.status_code, name: s.status_name },
    ]),
  )

  return rows.map((r) => {
    const st = r.booking_status_id
      ? statusById.get(r.booking_status_id)
      : undefined
    return {
      bookingId: r.booking_id,
      propertyId: r.property_id,
      propertyName:
        propNames.get(r.property_id) ?? `Property #${r.property_id}`,
      roomLabel: roomLabels.get(r.room_id) ?? `Room #${r.room_id}`,
      bedNumber: r.bed_id != null ? (bedNumbers.get(r.bed_id) ?? null) : null,
      checkIn: r.check_in_date,
      checkOut: r.check_out_date,
      statusCode: st?.code ?? null,
      statusName: st?.name ?? null,
      totalAmount: Number(r.total_amount),
      currency: r.currency,
      submittedAt: r.submission_date,
      tenantName: options.withTenant
        ? (tenantNames.get(r.user_id) ?? null)
        : undefined,
      tenantId: options.withTenant ? r.user_id : undefined,
    }
  })
}

/* ------------------------------------------------------------------ *
 * Booking form context
 * ------------------------------------------------------------------ */

export type BookingFormRoom = {
  roomId: number
  label: string
  beds: { bedId: number; bedNumber: string }[]
  /** The landlord asks for 1 month of rent in advance / a 1 month refundable deposit. */
  requireAdvance: boolean
  requireDeposit: boolean
  rates: {
    period: BookingPeriod
    price: number
    rateId: number
    validFrom: string
    validUntil: string | null
  }[]
}

export async function getBookingFormContext(propertyId: number) {
  await requireUser()

  // Independent reads, started together (was four sequential round-trips).
  const [property, rooms, beds, rates] = await Promise.all([
    discoveryRepo.getVisibleProperty(propertyId),
    roomsRepo.listRoomsByProperty(propertyId),
    bedsRepo.listBedsByProperty(propertyId),
    discoveryRepo.listActiveRates([propertyId]),
  ])
  if (!property) throw new ServiceError('Property not found.', 'not_found')

  const bedsByRoom = new Map<number, typeof beds>()
  for (const b of beds) {
    const list = bedsByRoom.get(b.room_id) ?? []
    list.push(b)
    bedsByRoom.set(b.room_id, list)
  }

  const roomViews: BookingFormRoom[] = rooms.map((room) => ({
    roomId: room.room_id,
    label:
      room.room_name || room.room_number
        ? [room.room_name, room.room_number].filter(Boolean).join(' · ')
        : `Room #${room.room_id}`,
    beds: (bedsByRoom.get(room.room_id) ?? []).map((b) => ({
      bedId: b.bed_id,
      bedNumber: b.bed_number,
    })),
    requireAdvance: room.require_advance === true,
    requireDeposit: room.require_deposit === true,
    rates: rates
      .filter((r) => r.room_id === room.room_id)
      .map((r) => ({
        period: r.period as BookingPeriod,
        price: Number(r.price),
        rateId: r.rate_id,
        validFrom: r.valid_from,
        validUntil: r.valid_until,
      })),
  }))

  return {
    property: {
      propertyId: property.property_id,
      name: property.property_name,
    },
    rooms: roomViews.filter((r) => r.beds.length > 0 && r.rates.length > 0),
  }
}

/* ------------------------------------------------------------------ *
 * Tenant: create / list / view / cancel
 * ------------------------------------------------------------------ */

export async function createBooking(
  propertyId: number,
  input: unknown,
): Promise<number> {
  const user = await requireUser()
  if (!user.roles.includes('tenant') && !isSuperadmin(user)) {
    throw new ServiceError(
      'Only a tenant account can request a booking.',
      'forbidden',
    )
  }

  const data = parseOrThrow(createBookingSchema, input)

  const property = await discoveryRepo.getVisibleProperty(propertyId)
  if (!property) throw new ServiceError('Property not found.', 'not_found')

  const room = await roomsRepo.getRoom(data.room_id)
  if (!room || room.property_id !== propertyId) {
    throw new ServiceError('Choose a room in this property.', 'validation', {
      room_id: ['Choose a room in this property.'],
    })
  }
  const bed = await bedsRepo.getBed(data.bed_id)
  if (!bed || bed.room_id !== data.room_id) {
    throw new ServiceError('Choose a bed in this room.', 'validation', {
      bed_id: ['Choose a bed in this room.'],
    })
  }

  // Resolve the rate for the room + period that covers the check-in date.
  const rates = (await discoveryRepo.listActiveRates([propertyId]))
    .filter((r) => r.room_id === data.room_id && r.period === data.period)
    .filter(
      (r) =>
        r.valid_from <= data.check_in &&
        (r.valid_until === null || r.valid_until >= data.check_in),
    )
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))

  const rate = rates[0]
  if (!rate) {
    throw new ServiceError(
      `No ${data.period} rate is set for this room on the selected date.`,
      'validation',
      { period: [`No ${data.period} rate for these dates.`] },
    )
  }

  // Optimistic availability check against confirmed / checked-in bookings.
  const conflicts = await bookingsRepo.listBlockingBookingsForBed(
    data.bed_id,
    await blockingStatusIds(),
  )
  if (
    conflicts.some((c) =>
      overlaps(
        data.check_in,
        data.check_out,
        c.check_in_date,
        c.check_out_date,
      ),
    )
  ) {
    throw new ServiceError(
      'That bed is already booked for the selected dates.',
      'conflict',
    )
  }

  const nights = nightsBetween(data.check_in, data.check_out)
  // What the tenant pays up front: rent + (if the room requires them) 1 month advance and
  // 1 month deposit. The amounts are saved on the booking, so later changes to the room's
  // settings never alter it.
  const charges = bookingCharges({
    period: data.period,
    unitPrice: Number(rate.price),
    nights,
    requireAdvance: room.require_advance === true,
    requireDeposit: room.require_deposit === true,
  })

  return bookingsRepo.callCreateBooking({
    p_user: user.legacyUserId,
    p_property: propertyId,
    p_room: data.room_id,
    p_bed: data.bed_id,
    p_rate: rate.rate_id,
    p_check_in: data.check_in,
    p_check_out: data.check_out,
    p_message: data.message ?? null,
    p_total: charges.total,
    p_period: data.period,
    p_price: Number(rate.price),
    p_rate_valid_from: rate.valid_from,
    p_rate_valid_until: rate.valid_until,
    // Only sent when used, so rooms without them keep working before migration 0014 is applied.
    ...(charges.advance > 0 && { p_advance: charges.advance }),
    ...(charges.deposit > 0 && { p_deposit: charges.deposit }),
  })
}

export async function listMyBookings(): Promise<BookingListItem[]> {
  const user = await requireUser()
  const rows = await readAfterSweep(() =>
    bookingsRepo.listBookingsByUser(user.legacyUserId),
  )
  return decorate(rows)
}

export type BookingDetail = BookingListItem & {
  message: string | null
  landlordResponse: string | null
  period: string | null
  unitPrice: number | null
  /** Part of `totalAmount`: 1 month advance and refundable 1 month deposit (0 if none). */
  advanceAmount: number
  depositAmount: number
  history: {
    at: string
    toName: string
    fromName: string | null
    notes: string | null
  }[]
  allowedTransitions: BookingTransition[]
  canTenantCancel: boolean
  tenantId: number
  propertyOwnerId: number | null
  /** statusCode === 'payment_pending' — the tenant still owes payment. */
  needsPayment: boolean
  paymentDueAt: string | null
}

async function buildDetail(
  row: bookingsRepo.BookingRow,
  options: { withTenant?: boolean },
): Promise<BookingDetail> {
  const [[base], snapshot, history, statuses, property] = await Promise.all([
    decorate([row], options),
    bookingsRepo.getRateSnapshot(row.booking_id),
    bookingsRepo.listStatusHistory(row.booking_id),
    referenceRepo.listBookingStatuses(),
    propertiesRepo.getProperty(row.property_id),
  ])
  const nameById = new Map(
    statuses.map((s) => [s.booking_status_id, s.status_name]),
  )

  return {
    ...base,
    tenantId: row.user_id,
    propertyOwnerId: property?.property_owner ?? null,
    message: row.booking_message,
    landlordResponse: row.landlord_response,
    period: snapshot?.period ?? null,
    unitPrice: snapshot ? Number(snapshot.price) : null,
    advanceAmount: Number(row.advance_amount ?? 0),
    depositAmount: Number(row.deposit_amount ?? 0),
    history: history.map((h) => ({
      at: h.created_at,
      toName: nameById.get(h.to_status_id) ?? 'Updated',
      fromName:
        h.from_status_id != null
          ? (nameById.get(h.from_status_id) ?? null)
          : null,
      notes: h.notes,
    })),
    allowedTransitions: allowedTransitions(base.statusCode),
    canTenantCancel:
      base.statusCode === 'pending' || base.statusCode === 'payment_pending',
    needsPayment: base.statusCode === 'payment_pending',
    paymentDueAt: row.payment_due_at,
  }
}

export async function getMyBooking(bookingId: number): Promise<BookingDetail> {
  const user = await requireUser()
  const row = await readAfterSweep(
    () => bookingsRepo.getBooking(bookingId),
    bookingId,
  )
  if (!row || (row.user_id !== user.legacyUserId && !isSuperadmin(user))) {
    throw new ServiceError('Booking not found.', 'not_found')
  }
  return buildDetail(row, { withTenant: false })
}

export async function cancelMyBooking(
  bookingId: number,
  response?: string,
): Promise<void> {
  const user = await requireUser()
  await bookingsRepo.callExpireOverdueBookings(bookingId)
  const row = await bookingsRepo.getBooking(bookingId)
  if (!row || (row.user_id !== user.legacyUserId && !isSuperadmin(user))) {
    throw new ServiceError('Booking not found.', 'not_found')
  }
  const statuses = await referenceRepo.listBookingStatuses()
  const fromCode = statuses.find(
    (s) => s.booking_status_id === row.booking_status_id,
  )?.status_code
  if (fromCode !== 'pending' && fromCode !== 'payment_pending') {
    throw new ServiceError(
      'This booking can no longer be cancelled here.',
      'conflict',
    )
  }
  await bookingsRepo.callSetBookingStatus({
    p_booking: bookingId,
    p_actor: user.legacyUserId,
    p_actor_role: primaryRole(user.roles),
    p_to_code: 'cancelled',
    p_response: response ?? null,
  })
}

/* ------------------------------------------------------------------ *
 * Manager (landlord / caretaker / superadmin)
 * ------------------------------------------------------------------ */

async function managerPropertyIds(
  user: Awaited<ReturnType<typeof requireUser>>,
  area: 'landlord' | 'caretaker',
): Promise<number[] | 'all'> {
  if (isSuperadmin(user)) return 'all'
  if (area === 'caretaker') {
    return caretakersRepo.listAssignedPropertyIds(user.legacyUserId, {
      activeOnly: true,
    })
  }
  const props = await propertiesRepo.listProperties({
    ownerId: user.legacyUserId,
  })
  return props.map((p) => p.property_id)
}

export async function listManagedBookings(
  area: 'landlord' | 'caretaker',
  statusCode?: string,
): Promise<BookingListItem[]> {
  const user = await requireUser()
  await bookingsRepo.callExpireOverdueBookings()
  const ids = await managerPropertyIds(user, area)

  let statusId: number | undefined
  if (statusCode) {
    const statuses = await referenceRepo.listBookingStatuses()
    statusId = statuses.find(
      (s) => s.status_code === statusCode,
    )?.booking_status_id
  }

  if (ids === 'all') {
    const all = await propertiesRepo.listProperties({})
    return decorate(
      await bookingsRepo.listBookingsByProperties(
        all.map((p) => p.property_id),
        { statusId },
      ),
      { withTenant: true },
    )
  }

  return decorate(
    await bookingsRepo.listBookingsByProperties(ids, { statusId }),
    { withTenant: true },
  )
}

export async function getManagedBooking(
  bookingId: number,
): Promise<BookingDetail> {
  await requireUser()
  await bookingsRepo.callExpireOverdueBookings(bookingId)
  const row = await bookingsRepo.getBooking(bookingId)
  if (!row) throw new ServiceError('Booking not found.', 'not_found')
  // Owner, superadmin, or an assigned caretaker.
  await requireOperableProperty(row.property_id)
  return buildDetail(row, { withTenant: true })
}

export async function transitionManagedBooking(
  bookingId: number,
  input: unknown,
): Promise<void> {
  const user = await requireUser()
  await bookingsRepo.callExpireOverdueBookings(bookingId)
  const row = await bookingsRepo.getBooking(bookingId)
  if (!row) throw new ServiceError('Booking not found.', 'not_found')
  await requireOperableProperty(row.property_id)

  const { to, response } = parseOrThrow(bookingActionSchema, input)

  const statuses = await referenceRepo.listBookingStatuses()
  const fromCode =
    statuses.find((s) => s.booking_status_id === row.booking_status_id)
      ?.status_code ?? null
  if (!allowedTransitions(fromCode).includes(to)) {
    throw new ServiceError(
      'That change is not allowed for this booking.',
      'conflict',
    )
  }

  await bookingsRepo.callSetBookingStatus({
    p_booking: bookingId,
    p_actor: user.legacyUserId,
    p_actor_role: primaryRole(user.roles),
    p_to_code: to,
    p_response: response ?? null,
  })
}
