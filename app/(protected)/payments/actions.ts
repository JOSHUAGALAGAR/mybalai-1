'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import * as payments from '@/services/payments.service'
import { ServiceError } from '@/services/errors'

export type PaymentActionState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      values?: Record<string, string>
    }
  | { status: 'success'; message: string }
  | undefined

function toErrorState(
  error: unknown,
  values?: Record<string, string>,
): PaymentActionState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
      values,
    }
  }
  console.error('[payments] action failed:', error)
  return {
    status: 'error',
    message: 'Something went wrong. Please try again.',
    values,
  }
}

function paymentId(formData: FormData): number {
  const id = Number(formData.get('payment_id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw new ServiceError('Invalid payment.', 'validation')
  }
  return id
}

export async function createPaymentAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const values: Record<string, string> = {}
  for (const [k, v] of formData.entries())
    if (typeof v === 'string') values[k] = v

  let id: number
  try {
    id = await payments.createPayment({
      booking_id: formData.get('booking_id'),
      amount: formData.get('amount'),
      method_code: formData.get('method_code'),
      reference_number: formData.get('reference_number'),
      paid_at: formData.get('paid_at'),
      note: formData.get('note'),
    })
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath('/payments')
  redirect(`/payments/${id}?created=1`)
}

export async function cancelPaymentAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  let id: number
  try {
    id = paymentId(formData)
    await payments.cancelMyPayment(
      id,
      String(formData.get('note') ?? '') || undefined,
    )
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath('/payments')
  redirect(`/payments/${id}`)
}

export async function decidePaymentAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const backTo = String(formData.get('back_to') || '/landlord/payments')
  let id: number
  try {
    id = paymentId(formData)
    await payments.decidePayment(id, {
      to: formData.get('to'),
      note: formData.get('note'),
    })
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath('/landlord/payments')
  revalidatePath('/caretaker/payments')
  redirect(`${backTo}/${id}`)
}

export async function addNoteAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  let id: number
  try {
    id = paymentId(formData)
    await payments.addNote(id, { note: formData.get('note') })
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath(`/payments/${id}`)
  revalidatePath(`/landlord/payments/${id}`)
  revalidatePath(`/caretaker/payments/${id}`)
  return { status: 'success', message: 'Note added.' }
}

export async function addReplyAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  let id: number
  try {
    id = paymentId(formData)
    await payments.addReply(id, {
      reply: formData.get('reply'),
      payment_note_id: formData.get('payment_note_id'),
    })
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath(`/payments/${id}`)
  revalidatePath(`/landlord/payments/${id}`)
  revalidatePath(`/caretaker/payments/${id}`)
  return { status: 'success', message: 'Reply added.' }
}

export async function attachReceiptAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  let id: number
  try {
    id = paymentId(formData)
    await payments.attachReceipt(id, {
      storage_path: formData.get('storage_path'),
      original_filename: formData.get('original_filename'),
      mime_type: formData.get('mime_type'),
      file_size: formData.get('file_size'),
    })
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath(`/payments/${id}`)
  revalidatePath(`/landlord/payments/${id}`)
  return { status: 'success', message: 'Receipt attached.' }
}

export async function payOnlineAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const id = Number(formData.get('payment_id'))
  if (!Number.isInteger(id) || id <= 0) {
    return { status: 'error', message: 'Invalid payment.' }
  }
  let url: string
  try {
    const { startPaymentCheckout } = await import('@/services/paymongo.service')
    url = await startPaymentCheckout({ paymentId: id })
  } catch (error) {
    return toErrorState(error)
  }
  redirect(url)
}

/** Return-page reconciliation (spec §16). Returns the current status. */
export async function reconcilePaymentAction(
  paymentId: number,
): Promise<{ status: 'paid' | 'pending' | 'failed' | 'expired' | 'unknown' }> {
  try {
    const { reconcilePayment } = await import('@/services/paymongo.service')
    const r = await reconcilePayment(paymentId)
    if (r.status === 'paid') revalidatePath(`/payments/${paymentId}`)
    return r
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') {
      return { status: 'unknown' }
    }
    console.error('[payments] reconcile failed:', error)
    return { status: 'unknown' }
  }
}
