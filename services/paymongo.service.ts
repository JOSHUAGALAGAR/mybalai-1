import 'server-only'

import { requireRole, requireUser } from '@/lib/auth/dal'
import { BOOST_ID_SETUP_MESSAGE, isBoostIdProblem } from '@/lib/db-errors'
import { isPaymongoConfigured } from '@/lib/env.server'
import {
  createCheckoutSession,
  extractPaidPayment,
  getCheckoutSession,
  listRecentPayments,
  verifyWebhookSignature,
  PaymongoError,
  type PaymongoResource,
} from '@/lib/paymongo/client'
import { mapPaymongoEvent } from '@/lib/paymongo/status'
import { isSuperadmin } from '@/lib/permissions/properties'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as messagingRepo from '@/repositories/messaging.repository'
import * as paymentsRepo from '@/repositories/payments.repository'
import * as paymongoRepo from '@/repositories/paymongo.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as boostsRepo from '@/repositories/boosts.repository'
import { ServiceError } from '@/services/errors'
import { requireManageableProperty } from '@/services/property-access'

export { isPaymongoConfigured }

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

function ensureConfigured(): void {
  if (!isPaymongoConfigured()) {
    throw new ServiceError('Online payments are not available yet.', 'conflict')
  }
}

/**
 * Run a PayMongo API call and turn a PaymongoError into a readable
 * ServiceError so the tenant/landlord sees the actual reason instead of a
 * generic "something went wrong".
 */
async function pmCall<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof PaymongoError) {
      const detail = error.message
        .replace(/^PayMongo \S+ \S+ failed \(\d+\): /, '')
        .trim()
      console.error(`[paymongo] ${label} failed:`, error.message, error.detail)
      throw new ServiceError(
        error.status === 401
          ? 'PayMongo rejected the request — check the secret key, and that your account is activated for live payments.'
          : `PayMongo could not ${label}: ${detail || 'unknown error'}`,
        'conflict',
      )
    }
    throw error
  }
}

async function paymentStatusCode(
  statusId: number | null,
): Promise<string | undefined> {
  const statuses = await referenceRepo.listPaymentStatuses()
  return statuses.find((s) => s.payment_status_id === statusId)?.status_code
}

/** PayMongo (centavos) vs the MyBalai record (PHP + currency). Spec §7.6/§12. */
function amountMatches(
  record: { amount: number; currency: string },
  paid: { amountCentavos: number; currency: string },
): boolean {
  const expected = Math.round(Number(record.amount) * 100)
  const currencyOk = (record.currency || 'PHP').toUpperCase() === paid.currency
  return expected === paid.amountCentavos && currencyOk
}

/* ------------------------------------------------------------------ *
 * Tenant — pay for a booking (spec §3–§5)
 * ------------------------------------------------------------------ */

/** Where PayMongo should send the browser after checkout; built once the payment id is known. */
export type CheckoutUrls = (ids: { paymentId: number; bookingId: number }) => {
  successUrl: string
  cancelUrl: string
}

export type StartedCheckout = {
  checkoutUrl: string
  paymentId: number
  bookingId: number
}

/**
 * Start a hosted checkout for a booking that is `payment_pending`, or retry an
 * existing pending payment. The amount is ALWAYS taken from the MyBalai record,
 * never the client.
 *
 * - `urls` overrides the return addresses (the mobile app returns via the bridge page);
 *   the website leaves it unset and gets its own pages.
 * - `reusePending` continues an unfinished payment for the booking instead of creating another
 *   one every time the tenant taps "Pay" (the website creates a new record per click).
 */
export async function startBookingCheckout(input: {
  bookingId?: number
  paymentId?: number
  reusePending?: boolean
  urls?: CheckoutUrls
}): Promise<StartedCheckout> {
  ensureConfigured()
  const user = await requireUser()
  const mine = (ownerId: number) =>
    ownerId === user.legacyUserId || isSuperadmin(user)

  let paymentId: number
  let bookingId: number
  let amountPhp: number
  let expiresAt: string | null = null

  if (input.paymentId) {
    const payment = await paymentsRepo.getPayment(input.paymentId)
    if (!payment || !mine(payment.user_id)) {
      throw new ServiceError('Payment not found.', 'not_found')
    }
    if ((await paymentStatusCode(payment.payment_status_id)) !== 'pending') {
      throw new ServiceError('This payment is already settled.', 'conflict')
    }
    if (payment.booking_id == null) {
      throw new ServiceError('This payment has no booking.', 'conflict')
    }
    paymentId = payment.payment_id
    bookingId = payment.booking_id
    amountPhp = Number(payment.amount)
    expiresAt = payment.expires_at
  } else if (input.bookingId) {
    await bookingsRepo.callExpireOverdueBookings(input.bookingId)
    const booking = await bookingsRepo.getBooking(input.bookingId)
    if (!booking || !mine(booking.user_id)) {
      throw new ServiceError('Booking not found.', 'not_found')
    }
    const statuses = await referenceRepo.listBookingStatuses()
    const code = statuses.find(
      (s) => s.booking_status_id === booking.booking_status_id,
    )?.status_code
    if (code !== 'payment_pending') {
      throw new ServiceError(
        'This booking is not awaiting payment.',
        'conflict',
      )
    }
    if (
      booking.payment_due_at &&
      new Date(booking.payment_due_at) < new Date()
    ) {
      throw new ServiceError('The payment window has closed.', 'conflict')
    }

    bookingId = booking.booking_id
    amountPhp = Number(booking.total_amount) // authoritative amount (§12)
    expiresAt = booking.payment_due_at

    const unfinished = input.reusePending
      ? await findPendingPayment(booking.booking_id, booking.user_id)
      : null

    paymentId = unfinished
      ? unfinished.payment_id
      : await paymentsRepo.callCreatePayment({
          p_user: booking.user_id,
          p_created_by: booking.user_id,
          p_created_by_role: 'tenant',
          p_booking: bookingId,
          p_amount: amountPhp,
          p_method: null,
          p_reference: null,
          p_paid_at: null,
          p_note: 'Online payment (PayMongo).',
        })
    if (expiresAt && !unfinished) {
      await paymongoRepo.setPaymentExpiry(paymentId, expiresAt)
    }
  } else {
    throw new ServiceError('Nothing to pay for.', 'validation')
  }

  const origin = siteOrigin()
  const { successUrl, cancelUrl } = input.urls
    ? input.urls({ paymentId, bookingId })
    : {
        successUrl: `${origin}/payments/${paymentId}?paid=1`,
        cancelUrl: `${origin}/bookings/${bookingId}`,
      }
  const session = await pmCall('start the checkout', () =>
    createCheckoutSession({
      amountPhp,
      name: `MyBalai booking payment #${paymentId}`,
      description: `Booking #${bookingId} payment`,
      referenceNumber: `PAY-${paymentId}`,
      successUrl,
      cancelUrl,
      metadata: {
        kind: 'booking_payment',
        payment_id: String(paymentId),
        booking_id: String(bookingId),
      },
    }),
  )

  // The return page reconciles by payment id against the stored session.
  await paymongoRepo.attachSessionToPayment(paymentId, session.id)
  return { checkoutUrl: session.checkoutUrl, paymentId, bookingId }
}

/** Website entry point: just the URL to redirect the browser to. */
export async function startPaymentCheckout(input: {
  bookingId?: number
  paymentId?: number
}): Promise<string> {
  return (await startBookingCheckout(input)).checkoutUrl
}

/** The tenant's unfinished (`pending`) payment for a booking, if any. */
async function findPendingPayment(bookingId: number, userId: number) {
  const [payments, statuses] = await Promise.all([
    paymentsRepo.listPaymentsByBookings([bookingId]),
    referenceRepo.listPaymentStatuses(),
  ])
  const pendingId = statuses.find(
    (s) => s.status_code === 'pending',
  )?.payment_status_id
  return (
    payments.find(
      (p) => p.user_id === userId && p.payment_status_id === pendingId,
    ) ?? null
  )
}

/* ------------------------------------------------------------------ *
 * Landlord — buy a property boost online
 * ------------------------------------------------------------------ */

/**
 * Start paying for a boost of one of the landlord's properties. The boost is created `pending`
 * and only becomes active when PayMongo says it was paid (webhook, or the check on the boosts page).
 */
export async function startBoostCheckout(input: {
  propertyId: number
  packageId: number
  /** Override the return addresses (the mobile app returns through the bridge page). */
  urls?: (ids: { boostId: number }) => { successUrl: string; cancelUrl: string }
}): Promise<{ checkoutUrl: string; boostId: number }> {
  ensureConfigured()
  const user = await requireRole('landlord', 'superadmin')

  const pack = await boostsRepo.getPackage(input.packageId)
  if (!pack || !pack.is_active) {
    throw new ServiceError('That boost is not available.', 'not_found')
  }
  const { property } = await requireManageableProperty(input.propertyId)
  const status = (await referenceRepo.listPropertyStatuses()).find(
    (st) => st.property_status_id === property.status_id,
  )?.status_code
  if (status !== 'active') {
    throw new ServiceError(
      'Only an approved (active) property can be boosted.',
      'conflict',
    )
  }

  await boostsRepo.cancelPendingFor(property.property_id) // stale, never-paid checkouts
  const boost = await boostsRepo
    .insertPending({
      property_id: property.property_id,
      landlord_id: property.property_owner ?? user.legacyUserId,
      package_id: pack.package_id,
      days: pack.days,
      amount: Number(pack.price),
    })
    .catch((error: unknown) => {
      if (isBoostIdProblem(error)) {
        throw new ServiceError(BOOST_ID_SETUP_MESSAGE, 'conflict')
      }
      throw error
    })

  const origin = siteOrigin()
  const { successUrl, cancelUrl } = input.urls
    ? input.urls({ boostId: boost.boost_id })
    : {
        successUrl: `${origin}/landlord/boosts?paid=1`,
        cancelUrl: `${origin}/landlord/boosts`,
      }
  const session = await pmCall('start the checkout', () =>
    createCheckoutSession({
      amountPhp: Number(pack.price),
      name: `MyBalai boost — ${property.property_name}`,
      description: `Boost ${property.property_name} for ${pack.days} days`,
      referenceNumber: `BOOST-${boost.boost_id}`,
      successUrl,
      cancelUrl,
      metadata: { kind: 'boost', boost_id: String(boost.boost_id) },
    }),
  )
  await boostsRepo.attachSession(boost.boost_id, session.id)
  return { checkoutUrl: session.checkoutUrl, boostId: boost.boost_id }
}

/* ------------------------------------------------------------------ *
 * Webhook fulfilment (called by app/api/paymongo/webhook) — spec §7–§11
 * ------------------------------------------------------------------ */

export async function handleWebhook(
  rawBody: string,
  signatureHeader: string | null,
): Promise<void> {
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    throw new PaymongoError('Invalid webhook signature.', 401)
  }

  const event = JSON.parse(rawBody) as {
    data?: {
      id?: string
      attributes?: { type?: string; data?: PaymongoResource }
    }
  }
  const eventId = event.data?.id
  const type = event.data?.attributes?.type ?? null
  if (!eventId) return

  if (!(await paymongoRepo.claimEvent(eventId, type))) return // §11 idempotency

  const outcome = mapPaymongoEvent(type)
  if (outcome === 'ignore') return

  const resource = event.data?.attributes?.data ?? {}
  const metadata = resource.attributes?.metadata ?? {}

  // Resolve the MyBalai record: metadata first, then the session id.
  let paymentId = Number(metadata.payment_id) || 0
  let boostId = Number(metadata.boost_id) || 0
  let kind = metadata.kind

  if (!kind && resource.id) {
    const p = await paymongoRepo.getPaymentBySession(resource.id)
    if (p) {
      kind = 'booking_payment'
      paymentId = p.payment_id
    } else {
      const boost = await boostsRepo.getBoostBySession(resource.id)
      if (boost) {
        kind = 'boost'
        boostId = boost.boost_id
      }
    }
  }

  if (outcome === 'refunded') {
    await applyRefund(kind, { paymentId, boostId })
  } else if (kind === 'booking_payment') {
    if (outcome === 'paid') await settlePaidBooking(paymentId, resource)
    else await failBookingPayment(paymentId, resource)
  } else if (kind === 'boost' && outcome === 'paid') {
    const paid = extractPaidPayment(resource)
    await settleBoost(boostId, paid?.paymongoPaymentId ?? null)
  }
}

/** Money was given back at PayMongo: mirror it. A refunded booking payment reverses the earning. */
async function applyRefund(
  kind: string | undefined,
  ids: { paymentId: number; boostId: number },
): Promise<void> {
  if (kind === 'booking_payment' && ids.paymentId > 0) {
    await paymentsRepo.callRefundPayment({
      p_payment: ids.paymentId,
      p_actor: null,
      p_note: null,
    })
  } else if (kind === 'boost' && ids.boostId > 0) {
    await boostsRepo.cancelBoost(ids.boostId, {
      reason: 'Refunded at PayMongo.',
      refunded: true,
    })
  }
}

async function settlePaidBooking(
  paymentId: number,
  resource: PaymongoResource,
): Promise<void> {
  if (!Number.isInteger(paymentId) || paymentId <= 0) return
  const payment = await paymentsRepo.getPayment(paymentId)
  if (!payment) return
  if ((await paymentStatusCode(payment.payment_status_id)) === 'paid') return

  const paid = extractPaidPayment(resource)
  if (!paid) {
    console.error('[paymongo] paid event with no settled payment', {
      paymentId,
    })
    return
  }
  if (!amountMatches(payment, paid)) {
    console.error('[paymongo] amount/currency mismatch — NOT settling', {
      paymentId,
      expected: Math.round(Number(payment.amount) * 100),
      got: paid.amountCentavos,
      currency: paid.currency,
    })
    return
  }

  await paymongoRepo.callSettleBookingPayment({
    p_payment: paymentId,
    p_paymongo_payment_id: paid.paymongoPaymentId,
  })
}

async function failBookingPayment(
  paymentId: number,
  resource: PaymongoResource,
): Promise<void> {
  let id = paymentId
  if ((!Number.isInteger(id) || id <= 0) && resource.id) {
    const p = await paymongoRepo.getPaymentBySession(resource.id)
    id = p?.payment_id ?? 0
  }
  if (!Number.isInteger(id) || id <= 0) return
  await paymongoRepo.callFailBookingPayment({
    p_payment: id,
    p_reason: 'The payment did not go through at PayMongo.',
  })
}

/** Activate a paid boost (idempotent) and tell the landlord. */
async function settleBoost(
  boostId: number,
  paymongoPaymentId: string | null,
): Promise<void> {
  if (!Number.isInteger(boostId) || boostId <= 0) return
  const boost = await boostsRepo.getBoost(boostId)
  if (!boost || boost.status === 'active' || boost.status === 'expired') return
  const result = await boostsRepo.callSettle(boostId, paymongoPaymentId)
  if (result !== 'settled') return
  await messagingRepo
    .notify({
      user_id: boost.landlord_id,
      notification_type: 'PAYMENT',
      title: 'Boost active',
      message: 'Your payment went through — your property is now boosted.',
      reference_type: 'boost',
      reference_id: boostId,
    })
    .catch((error) => console.error('[paymongo] boost notify failed:', error))
}

/* ------------------------------------------------------------------ *
 * Return-page reconciliation (spec §16) — server-side check, no webhook
 * ------------------------------------------------------------------ */

export type ReconcileResult = {
  status: 'paid' | 'pending' | 'failed' | 'expired' | 'unknown'
}

export async function reconcilePayment(
  paymentId: number,
): Promise<ReconcileResult> {
  const user = await requireUser()
  const payment = await paymentsRepo.getPayment(paymentId)
  if (
    !payment ||
    (payment.user_id !== user.legacyUserId && !isSuperadmin(user))
  ) {
    throw new ServiceError('Payment not found.', 'not_found')
  }

  const code = await paymentStatusCode(payment.payment_status_id)
  if (code === 'paid') return { status: 'paid' }
  if (code === 'failed') return { status: 'failed' }
  if (code === 'expired') return { status: 'expired' }

  if (!isPaymongoConfigured() || !payment.paymongo_session_id) {
    return { status: (code as ReconcileResult['status']) ?? 'unknown' }
  }

  const session = await pmCall('check the payment', () =>
    getCheckoutSession(payment.paymongo_session_id as string),
  )
  const paid = extractPaidPayment(session.raw)
  if (paid && amountMatches(payment, paid)) {
    await settle(paymentId, paid.paymongoPaymentId)
    return { status: 'paid' }
  }

  // The session can still read "active" after a QR Ph payment went through: look the payment up.
  const recent = await recentPaymentsBestEffort()
  const found = findPaidFor(paymentId, payment, recent)
  if (found) {
    await settle(paymentId, found)
    return { status: 'paid' }
  }
  return { status: 'pending' }
}

async function settle(paymentId: number, paymongoPaymentId: string | null) {
  await paymongoRepo.callSettleBookingPayment({
    p_payment: paymentId,
    p_paymongo_payment_id: paymongoPaymentId,
  })
}

/** Recent PayMongo payments, or [] when they cannot be fetched (reconciliation is best-effort). */
async function recentPaymentsBestEffort(): Promise<PaymongoResource[]> {
  try {
    return await listRecentPayments(50)
  } catch (error) {
    console.error('[paymongo] could not list recent payments:', error)
    return []
  }
}

/**
 * The PayMongo payment id that settles MyBalai payment `paymentId`, if one of `recent` is a PAID
 * payment that we created for it (metadata.payment_id) for exactly the amount we asked for.
 */
export function findPaidFor(
  paymentId: number,
  record: { amount: number; currency: string },
  recent: PaymongoResource[],
  key: 'payment_id' | 'boost_id' = 'payment_id',
): string | null {
  for (const resource of recent) {
    if (resource.attributes?.metadata?.[key] !== String(paymentId)) continue
    const paid = extractPaidPayment({ ...resource, type: 'payment' })
    if (paid && amountMatches(record, paid)) return paid.paymongoPaymentId
  }
  return null
}

/**
 * Settle every payment of the signed-in tenant that PayMongo says is already paid but that the
 * webhook never told us about (it cannot reach a laptop / a server that is down). One PayMongo
 * call covers all of them, and nothing is called when there is nothing pending. Never throws:
 * the screen asking for it must still load.
 */
export async function reconcileMyPendingPayments(): Promise<number> {
  try {
    if (!isPaymongoConfigured()) return 0
    const user = await requireUser()
    const [mine, statuses] = await Promise.all([
      paymentsRepo.listPaymentsByUser(user.legacyUserId),
      referenceRepo.listPaymentStatuses(),
    ])
    const pendingId = statuses.find(
      (s) => s.status_code === 'pending',
    )?.payment_status_id
    const waiting = mine.filter(
      (p) =>
        p.payment_status_id === pendingId &&
        p.paymongo_session_id &&
        p.booking_id != null,
    )
    if (waiting.length === 0) return 0

    const recent = await recentPaymentsBestEffort()
    let settled = 0
    for (const payment of waiting) {
      const found = findPaidFor(payment.payment_id, payment, recent)
      if (found) {
        await settle(payment.payment_id, found)
        settled += 1
      }
    }
    return settled
  } catch (error) {
    console.error('[paymongo] reconcile of pending payments failed:', error)
    return 0
  }
}

/**
 * Activate every boost of the signed-in landlord that PayMongo says is paid but that the webhook
 * never told us about. One PayMongo call, none when nothing is pending; never throws.
 */
export async function reconcileMyPendingBoosts(): Promise<number> {
  try {
    if (!isPaymongoConfigured()) return 0
    const user = await requireUser()
    const waiting = (await boostsRepo.listByLandlord(user.legacyUserId)).filter(
      (b) => b.status === 'pending' && b.paymongo_session_id,
    )
    if (waiting.length === 0) return 0
    const recent = await recentPaymentsBestEffort()
    let activated = 0
    for (const boost of waiting) {
      const found = findPaidFor(
        boost.boost_id,
        { amount: Number(boost.amount), currency: 'PHP' },
        recent,
        'boost_id',
      )
      if (found) {
        await settleBoost(boost.boost_id, found)
        activated += 1
      }
    }
    return activated
  } catch (error) {
    console.error('[paymongo] reconcile of pending boosts failed:', error)
    return 0
  }
}
