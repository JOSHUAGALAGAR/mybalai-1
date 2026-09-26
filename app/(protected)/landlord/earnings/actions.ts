'use server'

import { revalidatePath } from 'next/cache'

import { ServiceError } from '@/services/errors'
import * as payouts from '@/services/payouts.service'

export type EarningsFormState =
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'success'; message: string }
  | undefined

function toError(error: unknown): EarningsFormState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
    }
  }
  console.error('[landlord/earnings] action failed:', error)
  return { status: 'error', message: 'Something went wrong. Please try again.' }
}

export async function saveMethodAction(
  _prev: EarningsFormState,
  formData: FormData,
): Promise<EarningsFormState> {
  const values: Record<string, string> = {}
  for (const [k, v] of formData.entries())
    if (typeof v === 'string') values[k] = v
  try {
    await payouts.saveWithdrawalMethod(values)
  } catch (error) {
    return toError(error)
  }
  revalidatePath('/landlord/earnings')
  return { status: 'success', message: 'Saved. Withdrawals will be sent here.' }
}

export async function requestWithdrawalAction(): Promise<EarningsFormState> {
  try {
    await payouts.requestWithdrawal()
  } catch (error) {
    return toError(error)
  }
  revalidatePath('/landlord/earnings')
  revalidatePath('/admin/payouts')
  return {
    status: 'success',
    message: 'Withdrawal requested. You’ll be notified when it is sent.',
  }
}
