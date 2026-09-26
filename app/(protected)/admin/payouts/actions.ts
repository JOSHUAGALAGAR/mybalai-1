'use server'

import { revalidatePath } from 'next/cache'

import { ServiceError } from '@/services/errors'
import * as payouts from '@/services/payouts.service'

export type PayoutFormState =
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'success'; message: string }
  | undefined

function toObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of formData.entries()) if (typeof v === 'string') out[k] = v
  return out
}

function toError(error: unknown): PayoutFormState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
    }
  }
  console.error('[admin/payouts] action failed:', error)
  return { status: 'error', message: 'Something went wrong. Please try again.' }
}

export async function saveSettingsAction(
  _prev: PayoutFormState,
  formData: FormData,
): Promise<PayoutFormState> {
  try {
    await payouts.updatePayoutSettings(toObject(formData))
  } catch (error) {
    return toError(error)
  }
  revalidatePath('/admin/payouts')
  revalidatePath('/landlord/earnings')
  return {
    status: 'success',
    message: 'Saved. New rates apply to payments made from now on.',
  }
}

export async function completePayoutAction(
  _prev: PayoutFormState,
  formData: FormData,
): Promise<PayoutFormState> {
  try {
    await payouts.completePayout(
      Number(formData.get('payout_id')),
      toObject(formData),
    )
  } catch (error) {
    return toError(error)
  }
  revalidatePath('/admin/payouts')
  return { status: 'success', message: 'Marked as paid.' }
}

export async function failPayoutAction(
  _prev: PayoutFormState,
  formData: FormData,
): Promise<PayoutFormState> {
  try {
    await payouts.failPayout(
      Number(formData.get('payout_id')),
      toObject(formData),
    )
  } catch (error) {
    return toError(error)
  }
  revalidatePath('/admin/payouts')
  return {
    status: 'success',
    message: 'Rejected. The money is back in the landlord’s balance.',
  }
}
