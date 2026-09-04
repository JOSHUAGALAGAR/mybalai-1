'use client'

import { useActionState } from 'react'

import {
  decidePaymentAction,
  type PaymentActionState,
} from '@/app/(protected)/payments/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function DecidePaymentPanel({
  paymentId,
  backTo,
}: {
  paymentId: number
  backTo: string
}) {
  const [state, action, pending] = useActionState<PaymentActionState, FormData>(
    decidePaymentAction,
    undefined,
  )

  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(event) => {
        const to = (
          (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
        )?.value
        if (to === 'rejected' && !window.confirm('Reject this payment?')) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="back_to" value={backTo} />

      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <Textarea
        name="note"
        rows={2}
        maxLength={2000}
        placeholder="Optional note to the tenant"
      />
      <div className="flex gap-2">
        <Button type="submit" name="to" value="paid" disabled={pending}>
          Verify as paid
        </Button>
        <Button
          type="submit"
          name="to"
          value="rejected"
          variant="destructive"
          disabled={pending}
        >
          Reject
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Verification is recorded server-side against your account.
      </p>
    </form>
  )
}
