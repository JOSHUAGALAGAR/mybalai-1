'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import {
  requestExtensionAction,
  type ExtensionActionState,
} from '@/app/(protected)/extensions/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'

export function RequestExtensionForm({
  bookingId,
  currentCheckOut,
  minDate,
  rateHint,
}: {
  bookingId: number
  currentCheckOut: string
  minDate: string
  rateHint: string | null
}) {
  const [state, action] = useActionState<ExtensionActionState, FormData>(
    requestExtensionAction,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const v = state?.status === 'error' ? (state.values ?? {}) : {}

  return (
    <form action={action} className="max-w-xl space-y-5" noValidate>
      <input type="hidden" name="booking_id" value={bookingId} />
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-muted-foreground">
        Current check-out: <strong>{currentCheckOut}</strong>
      </p>

      <FormField
        label="New check-out date"
        htmlFor="new_check_out"
        required
        error={errs.new_check_out}
        hint={
          rateHint
            ? `The extra time is billed at ${rateHint}. You'll get a payment to settle once the landlord approves.`
            : 'The landlord will confirm the amount when approving.'
        }
      >
        <Input
          id="new_check_out"
          name="new_check_out"
          type="date"
          min={minDate}
          required
          defaultValue={v.new_check_out ?? ''}
        />
      </FormField>

      <FormField
        label="Message to the landlord"
        htmlFor="message"
        error={errs.message}
      >
        <Textarea
          id="message"
          name="message"
          rows={4}
          maxLength={2000}
          defaultValue={v.message ?? ''}
        />
      </FormField>

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Sending…">Request extension</SubmitButton>
        <Button asChild variant="outline">
          <Link href={`/bookings/${bookingId}`}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
