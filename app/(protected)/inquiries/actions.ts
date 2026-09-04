'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import * as inquiries from '@/services/inquiries.service'
import { ServiceError } from '@/services/errors'

export type InquiryActionState =
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
): InquiryActionState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
      values,
    }
  }
  console.error('[inquiries] action failed:', error)
  return { status: 'error', message: 'Something went wrong.', values }
}

export async function createInquiryAction(
  _prev: InquiryActionState,
  formData: FormData,
): Promise<InquiryActionState> {
  const propertyId = Number(formData.get('property_id'))
  const values = {
    subject: String(formData.get('subject') ?? ''),
    message: String(formData.get('message') ?? ''),
  }
  let id: number
  try {
    id = await inquiries.createInquiry(propertyId, values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath('/inquiries')
  redirect(`/inquiries/${id}`)
}

export async function respondInquiryAction(
  _prev: InquiryActionState,
  formData: FormData,
): Promise<InquiryActionState> {
  const id = Number(formData.get('inquiry_id'))
  const backTo = String(formData.get('back_to') || '/landlord/inquiries')
  try {
    await inquiries.respondToInquiry(id, {
      response: formData.get('response'),
      close: formData.get('close'),
    })
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath('/landlord/inquiries')
  revalidatePath('/caretaker/inquiries')
  redirect(`${backTo}/${id}`)
}
