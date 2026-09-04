'use server'

import { redirect } from 'next/navigation'

import { startSubscriptionCheckout } from '@/services/paymongo.service'
import { ServiceError } from '@/services/errors'

export type SubscribeActionState =
  { status: 'error'; message: string } | undefined

export async function subscribeAction(
  _prev: SubscribeActionState,
  formData: FormData,
): Promise<SubscribeActionState> {
  const planId = Number(formData.get('plan_id'))
  if (!Number.isInteger(planId) || planId <= 0) {
    return { status: 'error', message: 'Invalid plan.' }
  }
  let url: string
  try {
    url = await startSubscriptionCheckout(planId)
  } catch (error) {
    if (error instanceof ServiceError) {
      return { status: 'error', message: error.message }
    }
    console.error('[landlord/plan] subscribe failed:', error)
    return { status: 'error', message: 'Something went wrong.' }
  }
  redirect(url)
}
