'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { createLandlord } from '@/services/admin.service'
import { ServiceError } from '@/services/errors'

export type LandlordActionState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      values?: Record<string, string>
    }
  | undefined

export async function createLandlordAction(
  _prev: LandlordActionState,
  formData: FormData,
): Promise<LandlordActionState> {
  const values: Record<string, string> = {}
  for (const [k, v] of formData.entries()) {
    if (typeof v === 'string') values[k] = v
  }
  let legacyUserId: number
  try {
    ;({ legacyUserId } = await createLandlord(values))
  } catch (error) {
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
  revalidatePath('/admin/landlords')
  redirect(`/admin/landlords/${legacyUserId}`)
}
