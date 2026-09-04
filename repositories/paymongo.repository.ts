import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type SubscriptionOrderRow = Tables<'subscription_orders'>

/* ---- payment <-> session ---- */

export async function attachSessionToPayment(
  paymentId: number,
  sessionId: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('payments')
    .update({ paymongo_session_id: sessionId, paid_channel: 'paymongo' })
    .eq('payment_id', paymentId)
  if (error) throw new RepositoryError('Failed to link the payment.', error)
}

export async function getPaymentBySession(
  sessionId: string,
): Promise<Tables<'payments'> | null> {
  const { data, error } = await createAdminClient()
    .from('payments')
    .select('*')
    .eq('paymongo_session_id', sessionId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the payment.', error)
  return data
}

export async function markPaymentPaymongoId(
  paymentId: number,
  paymongoPaymentId: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('payments')
    .update({ paymongo_payment_id: paymongoPaymentId })
    .eq('payment_id', paymentId)
  if (error)
    throw new RepositoryError('Failed to record the payment id.', error)
}

export async function setPaymentExpiry(
  paymentId: number,
  expiresAt: string | null,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('payments')
    .update({ expires_at: expiresAt })
    .eq('payment_id', paymentId)
  if (error) throw new RepositoryError('Failed to set the deadline.', error)
}

/* ---- booking-payment settlement RPCs (see migration 0012) ---- */

export async function callSettleBookingPayment(args: {
  p_payment: number
  p_paymongo_payment_id: string | null
}): Promise<string> {
  const { data, error } = await createAdminClient().rpc(
    'settle_booking_payment',
    args,
  )
  if (error) throw new RepositoryError('Failed to settle the payment.', error)
  return data as string
}

export async function callFailBookingPayment(args: {
  p_payment: number
  p_reason: string | null
}): Promise<string> {
  const { data, error } = await createAdminClient().rpc(
    'fail_booking_payment',
    args,
  )
  if (error) throw new RepositoryError('Failed to record the failure.', error)
  return data as string
}

/* ---- subscription orders ---- */

export async function insertSubscriptionOrder(values: {
  landlord_id: number
  plan_id: number
  amount: number
  interval_days: number
}): Promise<SubscriptionOrderRow> {
  const { data, error } = await createAdminClient()
    .from('subscription_orders')
    .insert({ ...values, status: 'pending', currency: 'PHP' })
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to create the order.', error)
  return data
}

export async function attachSessionToOrder(
  orderId: number,
  sessionId: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('subscription_orders')
    .update({
      paymongo_session_id: sessionId,
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', orderId)
  if (error) throw new RepositoryError('Failed to link the order.', error)
}

export async function getOrder(
  orderId: number,
): Promise<SubscriptionOrderRow | null> {
  const { data, error } = await createAdminClient()
    .from('subscription_orders')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the order.', error)
  return data
}

export async function getOrderBySessionId(
  sessionId: string,
): Promise<SubscriptionOrderRow | null> {
  const { data, error } = await createAdminClient()
    .from('subscription_orders')
    .select('*')
    .eq('paymongo_session_id', sessionId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the order.', error)
  return data
}

export async function markOrderPaid(
  orderId: number,
  paymongoPaymentId: string | null,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('subscription_orders')
    .update({
      status: 'paid',
      paymongo_payment_id: paymongoPaymentId,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', orderId)
  if (error) throw new RepositoryError('Failed to settle the order.', error)
}

/* ---- webhook idempotency ---- */

/** Returns true if this is the first time we have seen `eventId`. */
export async function claimEvent(
  eventId: string,
  eventType: string | null,
): Promise<boolean> {
  const { error } = await createAdminClient()
    .from('paymongo_events')
    .insert({ event_id: eventId, event_type: eventType })
  if (!error) return true
  if (error.code === '23505') return false // already processed
  throw new RepositoryError('Failed to record the event.', error)
}
