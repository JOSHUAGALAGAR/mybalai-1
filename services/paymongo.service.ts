import 'server-only'

import { requireRole, requireUser } from '@/lib/auth/dal'
import { isPaymongoConfigured } from '@/lib/env.server'
import {
  createCheckoutSession,
  extractPaidPayment,
  getCheckoutSession,
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
import * as subsRepo from '@/repositories/subscriptions.repository'
import { ServiceError } from '@/services/errors'

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
 * Landlord — pay for a subscription plan online
 * ------------------------------------------------------------------ */

export async function startSubscriptionCheckout(
  planId: number,
): Promise<string> {
  ensureConfigured()
  const user = await requireRole('landlord', 'superadmin')

  const plan = await subsRepo.getPlan(planId)
  if (!plan || !plan.is_active) {
    throw new ServiceError('That plan is not available.', 'not_found')
  }
  if (Number(plan.price) <= 0) {
    throw new ServiceError(
      'This plan has no price — the superadmin assigns it directly.',
      'conflict',
    )
  }

  const order = await paymongoRepo.insertSubscriptionOrder({
    landlord_id: user.legacyUserId,
    plan_id: plan.plan_id,
    amount: Number(plan.price),
    interval_days: plan.billing_interval_days,
  })

  const origin = siteOrigin()
  const session = await pmCall('start the checkout', () =>
    createCheckoutSession({
      amountPhp: Number(plan.price),
      name: `MyBalai ${plan.name} plan`,
      description: `${plan.name} subscription (${plan.billing_interval_days} days)`,
      referenceNumber: `SUB-${order.order_id}`,
      successUrl: `${origin}/landlord/plan?subscribed=1`,
      cancelUrl: `${origin}/landlord/plan`,
      metadata: { kind: 'subscription', order_id: String(order.order_id) },
    }),
  )

  await paymongoRepo.attachSessionToOrder(order.order_id, session.id)
  return session.checkoutUrl
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
  let orderId = Number(metadata.order_id) || 0
  let kind = metadata.kind

  if (!kind && resource.id) {
    const p = await paymongoRepo.getPaymentBySession(resource.id)
    if (p) {
      kind = 'booking_payment'
      paymentId = p.payment_id
    } else {
      const o = await paymongoRepo.getOrderBySessionId(resource.id)
      if (o) {
        kind = 'subscription'
        orderId = o.order_id
      }
    }
  }

  if (kind === 'booking_payment') {
    if (outcome === 'paid') await settlePaidBooking(paymentId, resource)
    else await failBookingPayment(paymentId, resource)
  } else if (kind === 'subscription' && outcome === 'paid') {
    const paid = extractPaidPayment(resource)
    await settleSubscriptionOrder(orderId, paid?.paymongoPaymentId ?? null)
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

async function settleSubscriptionOrder(
  orderId: number,
  paymongoPaymentId: string | null,
): Promise<void> {
  if (!Number.isInteger(orderId) || orderId <= 0) return
  const order = await paymongoRepo.getOrder(orderId)
  if (!order || order.status === 'paid') return

  await paymongoRepo.markOrderPaid(orderId, paymongoPaymentId)

  const now = new Date()
  const endsAt = new Date(
    now.getTime() + order.interval_days * 86_400_000,
  ).toISOString()

  await subsRepo.upsertSubscription({
    landlord_id: order.landlord_id,
    plan_id: order.plan_id,
    status: 'active',
    starts_at: now.toISOString(),
    ends_at: endsAt,
    assigned_by: null,
    note: `Paid online (order #${orderId}).`,
  })

  await messagingRepo.notify({
    user_id: order.landlord_id,
    notification_type: 'SUBSCRIPTION',
    title: 'Subscription active',
    message: 'Your plan payment went through — your subscription is active.',
    reference_type: 'subscription',
    reference_id: order.plan_id,
  })
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
    await paymongoRepo.callSettleBookingPayment({
      p_payment: paymentId,
      p_paymongo_payment_id: paid.paymongoPaymentId,
    })
    return { status: 'paid' }
  }
  return { status: 'pending' }
}
