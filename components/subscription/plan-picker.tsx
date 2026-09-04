'use client'

import { useActionState } from 'react'

import {
  subscribeAction,
  type SubscribeActionState,
} from '@/app/(protected)/landlord/plan/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { PurchasablePlan } from '@/services/subscriptions.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function PlanPicker({ plans }: { plans: PurchasablePlan[] }) {
  const [state, action, pending] = useActionState<
    SubscribeActionState,
    FormData
  >(subscribeAction, undefined)

  if (plans.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Available plans</h2>
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => (
          <div
            key={p.planId}
            className="flex flex-col rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm font-semibold text-foreground">{p.name}</p>
            <p className="text-lg font-semibold text-foreground">
              {peso.format(p.price)}
              <span className="text-xs font-normal text-muted-foreground">
                {' '}
                / {p.intervalDays} days
              </span>
            </p>
            {p.description && (
              <p className="mt-1 text-xs text-muted-foreground">
                {p.description}
              </p>
            )}
            <ul className="mt-2 flex-1 space-y-0.5 text-xs text-muted-foreground">
              <li>{p.maxProperties} properties</li>
              <li>{p.maxRoomsPerProperty} rooms / property</li>
              <li>{p.maxBedsPerRoom} beds / room</li>
              <li>{p.maxCaretakers} caretakers</li>
            </ul>
            <form action={action} className="mt-3">
              <input type="hidden" name="plan_id" value={p.planId} />
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={pending}
              >
                {pending ? 'Redirecting…' : 'Subscribe'}
              </Button>
            </form>
          </div>
        ))}
      </div>
    </div>
  )
}
