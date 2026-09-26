'use client'

import { useActionState } from 'react'

import {
  refundPaymentAction,
  type RefundState,
} from '@/app/(protected)/admin/payments/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Superadmin only, on a PAID payment: record that the money went back to the tenant. */
export function RefundPanel({ paymentId }: { paymentId: number }) {
  const [state, action, pending] = useActionState<RefundState, FormData>(
    refundPaymentAction,
    undefined,
  )
  return (
    <section
      aria-label="Refund"
      className="space-y-3 rounded-2xl border border-destructive/40 p-4"
    >
      <div>
        <h2 className="text-sm font-bold text-foreground">
          Refund this payment
        </h2>
        <p className="text-sm text-muted-foreground">
          This only <strong>records</strong> a refund — it doesn’t send money.
          Refund the tenant in the PayMongo dashboard first (PayMongo then tells
          MyBalai automatically), or after you have refunded by other means. The
          landlord’s earning is reversed; if they already withdrew it, it is
          taken off their next withdrawal.
        </p>
      </div>
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state?.status === 'success' && (
        <Alert>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <form
        action={action}
        className="flex flex-wrap items-end gap-2"
        noValidate
      >
        <input type="hidden" name="payment_id" value={paymentId} />
        <label className="min-w-56 flex-1 text-xs font-semibold text-muted-foreground">
          Note (optional)
          <Input name="note" maxLength={500} className="mt-1 h-10" />
        </label>
        <label className="w-44 text-xs font-semibold text-muted-foreground">
          Type REFUND
          <Input name="confirm" autoComplete="off" className="mt-1 h-10" />
        </label>
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? 'Recording…' : 'Record refund'}
        </Button>
      </form>
    </section>
  )
}
