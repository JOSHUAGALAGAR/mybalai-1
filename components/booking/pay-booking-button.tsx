'use client'

import { useActionState } from 'react'

import {
  payForBookingAction,
  type BookingActionState,
} from '@/app/(protected)/bookings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function PayBookingButton({
  bookingId,
  amount,
  dueAt,
}: {
  bookingId: number
  amount: number
  dueAt: string | null
}) {
  const [state, action, pending] = useActionState<BookingActionState, FormData>(
    payForBookingAction,
    undefined,
  )

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
      <p className="text-sm font-semibold text-foreground">Payment required</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {peso.format(amount)} to confirm this booking
        {dueAt && (
          <>
            {' '}
            — pay by{' '}
            <strong className="text-foreground">
              {new Date(dueAt).toLocaleString()}
            </strong>
          </>
        )}
        .
      </p>
      <form action={action} className="mt-3">
        <input type="hidden" name="booking_id" value={bookingId} />
        {state?.status === 'error' && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Redirecting…' : 'Pay now'}
        </Button>
      </form>
      <p className="mt-1 text-xs text-muted-foreground">
        Card, GCash, Maya, or GrabPay via PayMongo. The booking confirms once
        the payment is verified.
      </p>
    </div>
  )
}
