'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import * as caretakers from '@/services/caretakers.service'
import { ServiceError } from '@/services/errors'

export type CaretakerFormState =
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
): CaretakerFormState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
      values,
    }
  }
  console.error('[landlord/caretakers] action failed:', error)
  return {
    status: 'error',
    message: 'Something went wrong. Please try again.',
    values,
  }
}

export async function createCaretakerAction(
  _prev: CaretakerFormState,
  formData: FormData,
): Promise<CaretakerFormState> {
  const values = {
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
  }
  let caretakerId: number
  try {
    caretakerId = (
      await caretakers.createCaretaker({
        fullName: formData.get('fullName'),
        email: formData.get('email'),
        password: formData.get('password'),
      })
    ).legacyUserId
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath('/landlord/caretakers')
  redirect(`/landlord/caretakers/${caretakerId}`)
}

export async function updateAssignmentsAction(
  _prev: CaretakerFormState,
  formData: FormData,
): Promise<CaretakerFormState> {
  const caretakerId = Number(formData.get('caretaker_id'))
  const property_ids = formData.getAll('property_ids').map(String)
  try {
    await caretakers.updateAssignments(caretakerId, { property_ids })
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath('/landlord/caretakers')
  revalidatePath(`/landlord/caretakers/${caretakerId}`)
  return { status: 'success', message: 'Assignments updated.' }
}
