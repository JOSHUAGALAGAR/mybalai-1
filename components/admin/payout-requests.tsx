'use client'

import { useActionState, useState } from 'react'

import {
  completePayoutAction,
  failPayoutAction,
  type PayoutFormState,
} from '@/app/(protected)/admin/payouts/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import type { AdminPayoutView } from '@/services/payouts.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})
const stamp = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

const STATUS = {
  pending: { label: 'Waiting', variant: 'secondary' },
  processing: { label: 'Processing', variant: 'secondary' },
  completed: { label: 'Paid', variant: 'default' },
  failed: { label: 'Rejected', variant: 'destructive' },
} as const

export function PayoutRequests({ items }: { items: AdminPayoutView[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No withdrawals here"
        description="When a landlord withdraws on the withdrawal day, the request shows up here."
      />
    )
  }
  return (
    <ul className="space-y-3">
      {items.map((p) => (
        <li
          key={p.payoutId}
          className="rounded-2xl border border-border bg-card p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-extrabold text-foreground">
                {peso.format(p.amount)}
              </p>
              <p className="text-sm text-foreground">
                {p.landlordName}
                {p.landlordEmail && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {p.landlordEmail}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.reference} · requested{' '}
                {stamp.format(new Date(p.requestedAt))}
              </p>
            </div>
            <Badge variant={STATUS[p.status].variant}>
              {STATUS[p.status].label}
            </Badge>
          </div>

          {p.sendTo ? (
            <dl className="mt-3 grid gap-x-6 gap-y-1 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Send via</dt>
                <dd className="font-medium">{p.sendTo.label}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Account name</dt>
                <dd className="font-medium">{p.sendTo.accountName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Account number
                </dt>
                <dd className="font-mono font-medium select-all">
                  {p.sendTo.accountNumber || p.sendTo.display}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-destructive">
              No withdrawal account on file.
            </p>
          )}

          {p.status === 'completed' && (
            <p className="mt-2 text-xs text-muted-foreground">
              Paid {p.completedAt ? stamp.format(new Date(p.completedAt)) : ''}
            </p>
          )}
          {p.status === 'failed' && p.failureReason && (
            <p className="mt-2 text-xs text-muted-foreground">
              Reason: {p.failureReason}
            </p>
          )}
          {(p.status === 'pending' || p.status === 'processing') && (
            <Decide payoutId={p.payoutId} />
          )}
        </li>
      ))}
    </ul>
  )
}

function Decide({ payoutId }: { payoutId: number }) {
  const [mode, setMode] = useState<'paid' | 'reject' | null>(null)
  return (
    <div className="mt-3 space-y-2">
      {mode === null && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setMode('paid')}>
            Mark as paid
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode('reject')}>
            Reject
          </Button>
        </div>
      )}
      {mode === 'paid' && (
        <DecisionForm
          action={completePayoutAction}
          payoutId={payoutId}
          field="reference"
          label="Transfer reference"
          placeholder="e.g. InstaPay ref 908098"
          submit="Confirm paid"
          onCancel={() => setMode(null)}
        />
      )}
      {mode === 'reject' && (
        <DecisionForm
          action={failPayoutAction}
          payoutId={payoutId}
          field="reason"
          label="Why? (the landlord will see this)"
          placeholder="e.g. Account number not found"
          submit="Reject and return the money"
          onCancel={() => setMode(null)}
        />
      )}
    </div>
  )
}

function DecisionForm({
  action,
  payoutId,
  field,
  label,
  placeholder,
  submit,
  onCancel,
}: {
  action: (state: PayoutFormState, fd: FormData) => Promise<PayoutFormState>
  payoutId: number
  field: string
  label: string
  placeholder: string
  submit: string
  onCancel: () => void
}) {
  const [state, formAction, pending] = useActionState<
    PayoutFormState,
    FormData
  >(action, undefined)
  const error =
    state?.status === 'error'
      ? (state.fieldErrors?.[field]?.[0] ?? state.message)
      : null
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2"
      noValidate
    >
      <input type="hidden" name="payout_id" value={payoutId} />
      <label className="min-w-64 flex-1 text-xs font-semibold text-muted-foreground">
        {label}
        <Input name={field} placeholder={placeholder} className="mt-1 h-10" />
      </label>
      <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
        {pending ? 'Saving…' : submit}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onCancel}
        disabled={pending}
      >
        Cancel
      </Button>
      {error && (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}
