/**
 * Single place that knows PayMongo's event / status vocabulary, so those
 * strings do not leak through the rest of the app (spec §13).
 *
 * Verify these against the current docs at https://developers.paymongo.com
 * before going live — event names and resource shapes can change.
 */

export const PAID_EVENTS = [
  'checkout_session.payment.paid',
  'payment.paid',
  'link.payment.paid',
] as const

export const FAILED_EVENTS = [
  'payment.failed',
  'checkout_session.payment.failed',
] as const

/** PayMongo sends this when money is given back (from the dashboard or the API). */
export const REFUNDED_EVENTS = ['payment.refunded'] as const

export type PaymongoOutcome = 'paid' | 'failed' | 'refunded' | 'ignore'

export function mapPaymongoEvent(
  eventType: string | null | undefined,
): PaymongoOutcome {
  if (!eventType) return 'ignore'
  if ((PAID_EVENTS as readonly string[]).includes(eventType)) return 'paid'
  if ((FAILED_EVENTS as readonly string[]).includes(eventType)) return 'failed'
  if ((REFUNDED_EVENTS as readonly string[]).includes(eventType))
    return 'refunded'
  return 'ignore'
}

/** MyBalai payment status a PayMongo outcome maps to. */
export function outcomeToPaymentStatus(
  outcome: PaymongoOutcome,
): 'paid' | 'failed' | null {
  if (outcome === 'paid') return 'paid'
  if (outcome === 'failed') return 'failed'
  return null
}

type PaymentLike = { attributes?: { status?: string } }

/** Is a checkout session's underlying payment actually settled? */
export function checkoutSessionIsPaid(session: {
  attributes?: {
    payment_intent?: { attributes?: { status?: string } } | null
    payments?: PaymentLike[] | null
  }
}): boolean {
  const intentStatus = session.attributes?.payment_intent?.attributes?.status
  if (intentStatus === 'succeeded' || intentStatus === 'paid') return true
  return (session.attributes?.payments ?? []).some(
    (p) => p.attributes?.status === 'paid',
  )
}
