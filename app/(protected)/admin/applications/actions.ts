'use server'

import { revalidatePath } from 'next/cache'

import { ServiceError } from '@/services/errors'
import {
  approveApplication,
  getApplicationDocuments,
  rejectApplication,
  resetApplicantPassword,
  type DocumentLink,
} from '@/services/applications.service'

export type ReviewState =
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'approved'; email: string; password: string }
  | { status: 'rejected' }
  | undefined

function toError(error: unknown): ReviewState {
  if (error instanceof ServiceError)
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
    }
  console.error('[admin/applications] action failed:', error)
  return { status: 'error', message: 'Something went wrong. Please try again.' }
}

export async function approveAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  try {
    const { email, password } = await approveApplication(
      Number(formData.get('application_id')),
    )
    revalidatePath('/admin/applications')
    revalidatePath('/admin/landlords')
    return { status: 'approved', email, password }
  } catch (error) {
    return toError(error)
  }
}

export async function rejectAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  try {
    await rejectApplication(Number(formData.get('application_id')), {
      reason: formData.get('reason'),
    })
    revalidatePath('/admin/applications')
    return { status: 'rejected' }
  } catch (error) {
    return toError(error)
  }
}

export type DocumentsState =
  | { status: 'error'; message: string }
  | { status: 'ok'; links: DocumentLink[] }
  | undefined

/** Fresh one-minute links to an application's files (every look is logged). */
export async function viewDocumentsAction(
  _prev: DocumentsState,
  formData: FormData,
): Promise<DocumentsState> {
  try {
    return {
      status: 'ok',
      links: await getApplicationDocuments(
        Number(formData.get('application_id')),
      ),
    }
  } catch (error) {
    if (error instanceof ServiceError)
      return { status: 'error', message: error.message }
    console.error('[admin/applications] documents failed:', error)
    return { status: 'error', message: 'Could not open the documents.' }
  }
}

/** A new temporary password for an approved applicant's account (shown once, in the popup). */
export async function resetPasswordAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  try {
    const { email, password } = await resetApplicantPassword(
      Number(formData.get('application_id')),
    )
    return { status: 'approved', email, password }
  } catch (error) {
    return toError(error)
  }
}
