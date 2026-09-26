'use server'

import { revalidatePath } from 'next/cache'

import { ServiceError } from '@/services/errors'
import { cancelBoost, savePackage } from '@/services/boosts.service'

export type PackageFormState =
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'success'; message: string }
  | undefined

export async function savePackageAction(
  _prev: PackageFormState,
  formData: FormData,
): Promise<PackageFormState> {
  const values: Record<string, string> = {}
  for (const [k, v] of formData.entries())
    if (typeof v === 'string') values[k] = v
  const id = values.package_id ? Number(values.package_id) : null
  try {
    await savePackage(id, values)
  } catch (error) {
    if (error instanceof ServiceError) {
      return {
        status: 'error',
        message: error.message,
        fieldErrors: error.fieldErrors,
      }
    }
    console.error('[admin/boosts] save failed:', error)
    return {
      status: 'error',
      message: 'Something went wrong. Please try again.',
    }
  }
  revalidatePath('/admin/boosts')
  revalidatePath('/landlord/boosts')
  return { status: 'success', message: 'Saved.' }
}

export async function cancelBoostAction(
  _prev: PackageFormState,
  formData: FormData,
): Promise<PackageFormState> {
  try {
    await cancelBoost(Number(formData.get('boost_id')), {
      reason: String(formData.get('reason') ?? ''),
      refunded: formData.get('refunded') === 'on',
    })
  } catch (error) {
    if (error instanceof ServiceError)
      return { status: 'error', message: error.message }
    console.error('[admin/boosts] cancel failed:', error)
    return {
      status: 'error',
      message: 'Something went wrong. Please try again.',
    }
  }
  revalidatePath('/admin/boosts')
  revalidatePath('/landlord/boosts')
  return { status: 'success', message: 'Cancelled.' }
}
