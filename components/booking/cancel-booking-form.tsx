'use client'

import { useActionState } from 'react'

import {
  cancelBookingAction,
  type BookingActionState,
} from '@/app/(protected)/bookings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function CancelBookingForm({ bookingId }: { bookingId: number }) {
  const [state, action, pending] = useActionState<BookingActionState, FormData>(
    cancelBookingAction,
    undefined,
  )

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('Cancel this booking?')) event.preventDefault()
      }}
    >
      <input type="hidden" name="booking_id" value={bookingId} />
      {state?.status === 'error' && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="destructive" disabled={pending}>
        Cancel booking
      </Button>
    </form>
  )
}
