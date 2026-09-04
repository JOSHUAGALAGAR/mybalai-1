'use client'

import { useActionState } from 'react'

import {
  assignSubscriptionAction,
  type LandlordActionState,
} from '@/app/(protected)/admin/landlords/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormField, nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import { SUBSCRIPTION_STATUSES } from '@/schemas/subscription'

export function SubscriptionForm({
  landlordId,
  plans,
  current,
}: {
  landlordId: number
  plans: { id: number; name: string }[]
  current: {
    planId: number | null
    status: string | null
    endsAt: string | null
    note: string | null
  }
}) {
  const [state, action] = useActionState<LandlordActionState, FormData>(
    assignSubscriptionAction,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}

  return (
    <form action={action} className="max-w-lg space-y-5" noValidate>
      <input type="hidden" name="landlord_id" value={landlordId} />
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <FormField label="Plan" htmlFor="plan_id" required error={errs.plan_id}>
        <select
          id="plan_id"
          name="plan_id"
          className={nativeControlClass}
          defaultValue={current.planId ?? ''}
          required
        >
          <option value="">Choose a plan</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Status" htmlFor="status" required error={errs.status}>
        <select
          id="status"
          name="status"
          className={nativeControlClass}
          defaultValue={current.status ?? 'active'}
          required
        >
          {SUBSCRIPTION_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="Ends on"
        htmlFor="ends_at"
        error={errs.ends_at}
        hint="Leave blank for an open-ended subscription."
      >
        <Input
          id="ends_at"
          name="ends_at"
          type="date"
          defaultValue={current.endsAt ? current.endsAt.slice(0, 10) : ''}
        />
      </FormField>

      <FormField label="Note" htmlFor="note" error={errs.note}>
        <Textarea
          id="note"
          name="note"
          rows={2}
          maxLength={500}
          defaultValue={current.note ?? ''}
        />
      </FormField>

      <SubmitButton pendingText="Saving…">
        {current.planId ? 'Update subscription' : 'Assign subscription'}
      </SubmitButton>
    </form>
  )
}
