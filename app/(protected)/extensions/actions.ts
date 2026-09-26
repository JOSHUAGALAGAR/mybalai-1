'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { safeBackTo } from '@/lib/navigation/back-to'
import * as extensions from '@/services/extensions.service'
import { ServiceError } from '@/services/errors'

export type ExtensionActionState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      values?: Record<string, string>
    }
  | undefined

function toErrorState(
  error: unknown,
  values?: Record<string, string>,
): ExtensionActionState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
      values,
    }
  }
  console.error('[extensions] action failed:', error)
  return { status: 'error', message: 'Something went wrong.', values }
}

function positiveInt(formData: FormData, key: string): number {
  const n = Number(formData.get(key))
  if (!Number.isInteger(n) || n <= 0) {
    throw new ServiceError('Invalid request.', 'validation')
  }
  return n
}

export async function requestExtensionAction(
  _prev: ExtensionActionState,
  formData: FormData,
): Promise<ExtensionActionState> {
  const values = {
    new_check_out: String(formData.get('new_check_out') ?? ''),
    message: String(formData.get('message') ?? ''),
  }
  let bookingId: number
  try {
    bookingId = positiveInt(formData, 'booking_id')
    await extensions.requestExtension(bookingId, values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath(`/bookings/${bookingId}`)
  redirect(`/bookings/${bookingId}?extension=requested`)
}

export async function cancelExtensionAction(
  _prev: ExtensionActionState,
  formData: FormData,
): Promise<ExtensionActionState> {
  const bookingId = String(formData.get('booking_id') || '')
  try {
    await extensions.cancelMyExtension(positiveInt(formData, 'extension_id'))
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath(`/bookings/${bookingId}`)
  redirect(`/bookings/${bookingId}`)
}

export async function decideExtensionAction(
  _prev: ExtensionActionState,
  formData: FormData,
): Promise<ExtensionActionState> {
  const backTo = safeBackTo(formData.get('back_to'), '/landlord/bookings')
  const bookingId = String(formData.get('booking_id') || '')
  try {
    await extensions.decideExtension(positiveInt(formData, 'extension_id'), {
      to: formData.get('to'),
      response: formData.get('response'),
    })
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath('/landlord/bookings')
  revalidatePath('/caretaker/bookings')
  revalidatePath('/admin/bookings')
  redirect(`${backTo}/${bookingId}`)
}
