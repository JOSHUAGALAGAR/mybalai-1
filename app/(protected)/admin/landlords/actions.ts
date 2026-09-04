'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import * as subscriptions from '@/services/subscriptions.service'
import { ServiceError } from '@/services/errors'

export type LandlordActionState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      values?: Record<string, string>
    }
  | undefined

function toObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of formData.entries()) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

function toErrorState(
  error: unknown,
  values: Record<string, string>,
): LandlordActionState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
      values,
    }
  }
  console.error('[admin/landlords] action failed:', error)
  return { status: 'error', message: 'Something went wrong.', values }
}

export async function createLandlordAction(
  _prev: LandlordActionState,
  formData: FormData,
): Promise<LandlordActionState> {
  const values = toObject(formData)
  let legacyUserId: number
  try {
    ;({ legacyUserId } = await subscriptions.createLandlord(values))
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath('/admin/landlords')
  redirect(`/admin/landlords/${legacyUserId}`)
}

export async function assignSubscriptionAction(
  _prev: LandlordActionState,
  formData: FormData,
): Promise<LandlordActionState> {
  const values = toObject(formData)
  const landlordId = Number(values.landlord_id)
  try {
    await subscriptions.assignSubscription(values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath('/admin/subscriptions')
  revalidatePath(`/admin/landlords/${landlordId}`)
  redirect(`/admin/landlords/${landlordId}`)
}
