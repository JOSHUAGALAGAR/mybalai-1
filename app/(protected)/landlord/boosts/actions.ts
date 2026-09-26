'use server'

import { redirect } from 'next/navigation'

import { ServiceError } from '@/services/errors'
import { startBoostCheckout } from '@/services/paymongo.service'

export type BoostFormState = { status: 'error'; message: string } | undefined

/** Create the pending boost and send the landlord to PayMongo to pay for it. */
export async function buyBoostAction(
  _prev: BoostFormState,
  formData: FormData,
): Promise<BoostFormState> {
  const propertyId = Number(formData.get('property_id'))
  const packageId = Number(formData.get('package_id'))
  if (!Number.isInteger(propertyId) || propertyId <= 0) {
    return { status: 'error', message: 'Choose a property to boost.' }
  }
  if (!Number.isInteger(packageId) || packageId <= 0) {
    return { status: 'error', message: 'Choose how long to boost it.' }
  }
  let url: string
  try {
    ;({ checkoutUrl: url } = await startBoostCheckout({
      propertyId,
      packageId,
    }))
  } catch (error) {
    if (error instanceof ServiceError)
      return { status: 'error', message: error.message }
    console.error('[landlord/boosts] checkout failed:', error)
    return {
      status: 'error',
      message: 'Could not start the payment. Please try again.',
    }
  }
  redirect(url)
}
