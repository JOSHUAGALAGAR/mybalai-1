'use client'

import { useActionState } from 'react'

import {
  payOnlineAction,
  type PaymentActionState,
} from '@/app/(protected)/payments/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function PayOnlineButton({ paymentId }: { paymentId: number }) {
  const [state, action, pending] = useActionState<PaymentActionState, FormData>(
    payOnlineAction,
    undefined,
  )

  return (
    <form action={action}>
      <input type="hidden" name="payment_id" value={paymentId} />
      {state?.status === 'error' && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Redirecting…' : 'Pay online'}
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">
        Card, GCash, Maya, or GrabPay via PayMongo. Verified automatically once
        it clears.
      </p>
    </form>
  )
}
