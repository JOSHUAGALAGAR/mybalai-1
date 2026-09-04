'use client'

import { useActionState } from 'react'

import {
  transitionBookingAction,
  type BookingActionState,
} from '@/app/(protected)/bookings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { BookingTransition } from '@/schemas/booking'

const LABEL: Record<BookingTransition, string> = {
  payment_pending: 'Approve — request payment',
  rejected: 'Reject',
  cancelled: 'Cancel booking',
  checked_in: 'Check in',
  checked_out: 'Check out',
}
const VARIANT: Record<
  BookingTransition,
  'default' | 'destructive' | 'secondary'
> = {
  payment_pending: 'default',
  rejected: 'destructive',
  cancelled: 'destructive',
  checked_in: 'secondary',
  checked_out: 'secondary',
}
const CONFIRM_MSG: Partial<Record<BookingTransition, string>> = {
  payment_pending: 'Approve this request? The tenant will be asked to pay.',
  rejected: 'Reject this booking request?',
  cancelled: 'Cancel this booking?',
}

export function ManageBookingPanel({
  bookingId,
  allowed,
  backTo,
}: {
  bookingId: number
  allowed: BookingTransition[]
  backTo: string
}) {
  const [state, action, pending] = useActionState<BookingActionState, FormData>(
    transitionBookingAction,
    undefined,
  )

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No further actions are available for this booking.
      </p>
    )
  }

  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(event) => {
        const to = (
          (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
        )?.value as BookingTransition | undefined
        const msg = to ? CONFIRM_MSG[to] : undefined
        if (msg && !window.confirm(msg)) event.preventDefault()
      }}
    >
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="back_to" value={backTo} />

      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {(allowed.includes('payment_pending') ||
        allowed.includes('rejected')) && (
        <Textarea
          name="response"
          rows={2}
          maxLength={2000}
          placeholder="Optional note to the tenant"
        />
      )}

      <div className="flex flex-wrap gap-2">
        {allowed.map((t) => (
          <Button
            key={t}
            type="submit"
            name="to"
            value={t}
            variant={VARIANT[t]}
            disabled={pending}
          >
            {LABEL[t]}
          </Button>
        ))}
      </div>
    </form>
  )
}
