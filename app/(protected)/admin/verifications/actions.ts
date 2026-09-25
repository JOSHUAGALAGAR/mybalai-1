'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ServiceError } from '@/services/errors'
import { decideVerification } from '@/services/verification.service'

export type VerificationActionState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      reason?: string
    }
  | undefined

/** Approve or reject one submission, then go back to the queue. */
export async function decideVerificationAction(
  _prev: VerificationActionState,
  formData: FormData,
): Promise<VerificationActionState> {
  const id = Number(formData.get('verification_id'))
  const reason = String(formData.get('reason') ?? '')
  if (!Number.isInteger(id) || id <= 0) {
    return { status: 'error', message: 'Invalid request.' }
  }
  try {
    await decideVerification(id, {
      decision: formData.get('decision'),
      reason,
    })
  } catch (error) {
    if (error instanceof ServiceError) {
      return {
        status: 'error',
        message: error.message,
        fieldErrors: error.fieldErrors,
        reason,
      }
    }
    console.error('[admin/verifications] decision failed:', error)
    return { status: 'error', message: 'Something went wrong.', reason }
  }
  revalidatePath('/admin/verifications')
  revalidatePath(`/admin/verifications/${id}`)
  revalidatePath('/admin')
  redirect('/admin/verifications')
}
