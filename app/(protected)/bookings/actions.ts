'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { safeBackTo } from '@/lib/navigation/back-to'
import * as bookings from '@/services/bookings.service'
import { ServiceError } from '@/services/errors'

export type BookingActionState =
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | undefined

function toErrorState(error: unknown): BookingActionState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
    }
  }
  console.error('[bookings] action failed:', error)
  return { status: 'error', message: 'Something went wrong. Please try again.' }
}

function bookingId(formData: FormData): number {
  const id = Number(formData.get('booking_id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw new ServiceError('Invalid booking.', 'validation')
  }
  return id
}

export async function cancelBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  let id: number
  try {
    id = bookingId(formData)
    await bookings.cancelMyBooking(
      id,
      String(formData.get('response') ?? '') || undefined,
    )
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath('/bookings')
  redirect(`/bookings/${id}`)
}

export async function transitionBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  let id: number
  const backTo = safeBackTo(formData.get('back_to'), '/landlord/bookings')
  try {
    id = bookingId(formData)
    await bookings.transitionManagedBooking(id, {
      to: formData.get('to'),
      response: formData.get('response'),
    })
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath('/landlord/bookings')
  revalidatePath('/caretaker/bookings')
  revalidatePath('/admin/bookings')
  redirect(`${backTo}/${id}`)
}

/** Spec §3: "Pay Now" from a payment_pending booking → hosted checkout. */
export async function payForBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  let url: string
  try {
    const id = bookingId(formData)
    const { startPaymentCheckout } = await import('@/services/paymongo.service')
    url = await startPaymentCheckout({ bookingId: id })
  } catch (error) {
    return toErrorState(error)
  }
  redirect(url)
}
