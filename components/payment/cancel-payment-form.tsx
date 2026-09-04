'use client'

import { useActionState } from 'react'

import {
  cancelPaymentAction,
  type PaymentActionState,
} from '@/app/(protected)/payments/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function CancelPaymentForm({ paymentId }: { paymentId: number }) {
  const [state, action, pending] = useActionState<PaymentActionState, FormData>(
    cancelPaymentAction,
    undefined,
  )

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('Cancel this payment?')) event.preventDefault()
      }}
    >
      <input type="hidden" name="payment_id" value={paymentId} />
      {state?.status === 'error' && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="destructive" disabled={pending}>
        Cancel payment
      </Button>
    </form>
  )
}
