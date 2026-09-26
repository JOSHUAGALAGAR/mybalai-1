'use server'

import { revalidatePath } from 'next/cache'

import { ServiceError } from '@/services/errors'
import { refundPayment } from '@/services/payments.service'

export type RefundState =
  | { status: 'error'; message: string }
  | { status: 'success'; message: string }
  | undefined

export async function refundPaymentAction(
  _prev: RefundState,
  formData: FormData,
): Promise<RefundState> {
  const paymentId = Number(formData.get('payment_id'))
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return { status: 'error', message: 'Invalid payment.' }
  }
  if (
    String(formData.get('confirm') ?? '')
      .trim()
      .toUpperCase() !== 'REFUND'
  ) {
    return { status: 'error', message: 'Type REFUND to confirm.' }
  }
  try {
    await refundPayment(paymentId, { note: String(formData.get('note') ?? '') })
  } catch (error) {
    if (error instanceof ServiceError)
      return { status: 'error', message: error.message }
    console.error('[admin/payments] refund failed:', error)
    return {
      status: 'error',
      message: 'Something went wrong. Please try again.',
    }
  }
  revalidatePath(`/admin/payments/${paymentId}`)
  revalidatePath('/admin/payments')
  revalidatePath('/landlord/earnings')
  return {
    status: 'success',
    message: 'Recorded as refunded. The landlord’s earning was reversed.',
  }
}
