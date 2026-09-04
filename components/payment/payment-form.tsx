'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import {
  createPaymentAction,
  type PaymentActionState,
} from '@/app/(protected)/payments/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField, nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'

type BookingOption = {
  bookingId: number
  label: string
  statusName: string | null
}
type MethodOption = { code: string; name: string }

export function PaymentForm({
  bookings,
  methods,
}: {
  bookings: BookingOption[]
  methods: MethodOption[]
}) {
  const [state, action] = useActionState<PaymentActionState, FormData>(
    createPaymentAction,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const v = state?.status === 'error' ? (state.values ?? {}) : {}

  if (bookings.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          You have no bookings to pay for yet. Submit a booking request first.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={action} className="max-w-lg space-y-5" noValidate>
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <FormField
        label="Booking"
        htmlFor="booking_id"
        required
        error={errs.booking_id}
      >
        <select
          id="booking_id"
          name="booking_id"
          className={nativeControlClass}
          defaultValue={v.booking_id ?? bookings[0]?.bookingId}
        >
          {bookings.map((b) => (
            <option key={b.bookingId} value={b.bookingId}>
              #{b.bookingId} — {b.label}
              {b.statusName ? ` (${b.statusName})` : ''}
            </option>
          ))}
        </select>
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Amount (PHP)"
          htmlFor="amount"
          required
          error={errs.amount}
        >
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            defaultValue={v.amount ?? ''}
          />
        </FormField>
        <FormField
          label="Method"
          htmlFor="method_code"
          required
          error={errs.method_code}
        >
          <select
            id="method_code"
            name="method_code"
            className={nativeControlClass}
            defaultValue={v.method_code ?? methods[0]?.code}
          >
            {methods.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Reference number"
          htmlFor="reference_number"
          error={errs.reference_number}
        >
          <Input
            id="reference_number"
            name="reference_number"
            maxLength={120}
            defaultValue={v.reference_number ?? ''}
          />
        </FormField>
        <FormField label="Date paid" htmlFor="paid_at" error={errs.paid_at}>
          <Input
            id="paid_at"
            name="paid_at"
            type="date"
            defaultValue={v.paid_at ?? ''}
          />
        </FormField>
      </div>

      <FormField label="Note" htmlFor="note" error={errs.note}>
        <Textarea id="note" name="note" rows={3} maxLength={2000} />
      </FormField>

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Submitting…">Submit payment</SubmitButton>
        <Button asChild variant="outline">
          <Link href="/payments">Cancel</Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Your payment is recorded as <strong>pending</strong> until the landlord
        verifies it. You can attach a receipt on the next screen.
      </p>
    </form>
  )
}
