import 'server-only'

import { requireUser } from '@/lib/auth/dal'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as messagingRepo from '@/repositories/messaging.repository'
import * as paymentsRepo from '@/repositories/payments.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import { ServiceError } from '@/services/errors'
import { getConversation, sendMessage } from '@/services/messaging.service'

/**
 * Messaging in the mobile app is stricter than on the website: a landlord and a tenant can only
 * message each other about a booking that is CONFIRMED (or the tenant has since checked in) AND
 * PAID. Before that — a pending request, an unpaid approval, a rejected or cancelled booking —
 * there is no conversation, so neither side can start one.
 *
 * (The website also lets managers message people who merely sent an inquiry; that is left alone.)
 */
export const MESSAGEABLE_BOOKING_STATUSES = ['confirmed', 'checked_in'] as const

export type EligibleConversation = { otherUserId: number; propertyId: number }

export type MobileConversation = EligibleConversation & {
  otherName: string | null
  propertyName: string | null
  lastMessage: string | null
  lastAt: string | null
  unread: number
}

const keyOf = (c: EligibleConversation) => `${c.otherUserId}:${c.propertyId}`

/** Every (other person, property) the caller may message about right now. */
export async function listEligibleConversations(): Promise<
  EligibleConversation[]
> {
  const me = await requireUser()

  // Bookings the caller is a party to: their own (as tenant) and/or at properties they own.
  const asTenant = me.roles.includes('tenant')
  const asLandlord = me.roles.includes('landlord')
  const ownedIds = asLandlord
    ? (await propertiesRepo.listProperties({ ownerId: me.legacyUserId })).map(
        (p) => p.property_id,
      )
    : []

  const [tenantBookings, landlordBookings, statuses, payStatuses] =
    await Promise.all([
      asTenant ? bookingsRepo.listBookingsByUser(me.legacyUserId) : [],
      asLandlord ? bookingsRepo.listBookingsByProperties(ownedIds) : [],
      referenceRepo.listBookingStatuses(),
      referenceRepo.listPaymentStatuses(),
    ])

  const okStatusIds = new Set(
    statuses
      .filter((s) =>
        (MESSAGEABLE_BOOKING_STATUSES as readonly string[]).includes(
          s.status_code,
        ),
      )
      .map((s) => s.booking_status_id),
  )
  const candidates = [
    ...tenantBookings.map((b) => ({ b, role: 'tenant' as const })),
    ...landlordBookings.map((b) => ({ b, role: 'landlord' as const })),
  ].filter(
    ({ b }) =>
      b.booking_status_id != null && okStatusIds.has(b.booking_status_id),
  )
  if (candidates.length === 0) return []

  // "Paid" means a payment with status `paid`, not just a status on the booking.
  const paidStatusId = payStatuses.find(
    (s) => s.status_code === 'paid',
  )?.payment_status_id
  const payments = await paymentsRepo.listPaymentsByBookings(
    candidates.map(({ b }) => b.booking_id),
  )
  const paidBookingIds = new Set(
    payments
      .filter(
        (p) => p.booking_id != null && p.payment_status_id === paidStatusId,
      )
      .map((p) => p.booking_id as number),
  )
  const paid = candidates.filter(({ b }) => paidBookingIds.has(b.booking_id))

  // A tenant's counterpart is the property's owner.
  const tenantPropertyIds = paid
    .filter((c) => c.role === 'tenant')
    .map(({ b }) => b.property_id)
  const owners = new Map(
    (
      await propertiesRepo.listPropertiesByIds([...new Set(tenantPropertyIds)])
    ).map((p) => [p.property_id, p.property_owner] as const),
  )

  const pairs = new Map<string, EligibleConversation>()
  for (const { b, role } of paid) {
    const otherUserId =
      role === 'landlord' ? b.user_id : owners.get(b.property_id)
    if (otherUserId == null || otherUserId === me.legacyUserId) continue
    const pair = { otherUserId, propertyId: b.property_id }
    pairs.set(keyOf(pair), pair)
  }
  return [...pairs.values()]
}

async function assertEligible(
  otherUserId: number,
  propertyId: number,
): Promise<void> {
  const ok = (await listEligibleConversations()).some(
    (c) => c.otherUserId === otherUserId && c.propertyId === propertyId,
  )
  if (!ok) {
    throw new ServiceError(
      'Messaging opens once a booking is confirmed and paid.',
      'forbidden',
    )
  }
}

/** The caller's conversations: every eligible pair, with the latest message if there is one. */
export async function listMobileConversations(): Promise<MobileConversation[]> {
  const me = await requireUser()
  const eligible = await listEligibleConversations()
  if (eligible.length === 0) return []

  const rows = await messagingRepo.listMessagesForUser(me.legacyUserId)
  const latest = new Map<string, { message: string; at: string }>()
  const unread = new Map<string, number>()
  for (const r of rows) {
    if (r.property_id == null) continue
    const other = r.sender_id === me.legacyUserId ? r.receiver_id : r.sender_id
    const key = keyOf({ otherUserId: other, propertyId: r.property_id })
    const seen = latest.get(key)
    if (!seen || r.created_at > seen.at)
      latest.set(key, { message: r.message, at: r.created_at })
    if (r.receiver_id === me.legacyUserId && !r.is_read)
      unread.set(key, (unread.get(key) ?? 0) + 1)
  }

  const [names, propNames] = await Promise.all([
    bookingsRepo.tenantNamesByIds(eligible.map((c) => c.otherUserId)),
    bookingsRepo.propertyNamesByIds(eligible.map((c) => c.propertyId)),
  ])

  return eligible
    .map((c) => {
      const last = latest.get(keyOf(c))
      return {
        ...c,
        otherName: names.get(c.otherUserId) ?? null,
        propertyName: propNames.get(c.propertyId) ?? null,
        lastMessage: last?.message ?? null,
        lastAt: last?.at ?? null,
        unread: unread.get(keyOf(c)) ?? 0,
      }
    })
    .sort((a, b) => {
      if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt)
      if (a.lastAt) return -1
      if (b.lastAt) return 1
      return (a.otherName ?? '').localeCompare(b.otherName ?? '')
    })
}

export async function getMobileThread(otherUserId: number, propertyId: number) {
  await assertEligible(otherUserId, propertyId)
  return getConversation(otherUserId, propertyId)
}

export async function sendMobileMessage(
  otherUserId: number,
  propertyId: number,
  message: unknown,
): Promise<void> {
  await assertEligible(otherUserId, propertyId)
  await sendMessage({
    receiver_id: otherUserId,
    property_id: propertyId,
    message,
  })
}
