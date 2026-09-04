'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import * as bookings from '@/services/bookings.service'
import { ServiceError } from '@/services/errors'

export type BookingFormState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      values?: Record<string, string>
    }
  | undefined

export async function createBookingAction(
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const values: Record<string, string> = {}
  for (const [k, v] of formData.entries()) {
    if (typeof v === 'string') values[k] = v
  }
  const propertyId = Number(formData.get('property_id'))

  let bookingId: number
  try {
    bookingId = await bookings.createBooking(propertyId, {
      room_id: formData.get('room_id'),
      bed_id: formData.get('bed_id'),
      period: formData.get('period'),
      check_in: formData.get('check_in'),
      check_out: formData.get('check_out'),
      message: formData.get('message'),
    })
  } catch (error) {
    if (error instanceof ServiceError) {
      return {
        status: 'error',
        message: error.message,
        fieldErrors: error.fieldErrors,
        values,
      }
    }
    console.error('[discover/book] action failed:', error)
    return {
      status: 'error',
      message: 'Something went wrong. Please try again.',
      values,
    }
  }

  revalidatePath('/bookings')
  redirect(`/bookings/${bookingId}?created=1`)
}
