'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import type { PlanActionState } from '@/app/(protected)/admin/plans/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'

type Values = Record<string, string>

export function PlanForm({
  action,
  planId,
  initial = {},
  submitLabel,
}: {
  action: (state: PlanActionState, fd: FormData) => Promise<PlanActionState>
  planId?: number
  initial?: Values
  submitLabel: string
}) {
  const [state, formAction] = useActionState<PlanActionState, FormData>(
    action,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const v: Values = {
    ...initial,
    ...(state?.status === 'error' ? (state.values ?? {}) : {}),
  }
  const isActiveDefault = (v.is_active ?? initial.is_active ?? 'on') !== ''

  return (
    <form action={formAction} className="max-w-xl space-y-5" noValidate>
      {planId !== undefined && (
        <input type="hidden" name="plan_id" value={planId} />
      )}
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Code" htmlFor="code" required error={errs.code}>
          <Input
            id="code"
            name="code"
            required
            maxLength={40}
            placeholder="free"
            defaultValue={v.code ?? ''}
          />
        </FormField>
        <FormField label="Name" htmlFor="name" required error={errs.name}>
          <Input
            id="name"
            name="name"
            required
            maxLength={80}
            defaultValue={v.name ?? ''}
          />
        </FormField>
      </div>

      <FormField
        label="Description"
        htmlFor="description"
        error={errs.description}
      >
        <Textarea
          id="description"
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={v.description ?? ''}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Max properties"
          htmlFor="max_properties"
          required
          error={errs.max_properties}
        >
          <Input
            id="max_properties"
            name="max_properties"
            type="number"
            min={0}
            required
            defaultValue={v.max_properties ?? '0'}
          />
        </FormField>
        <FormField
          label="Max rooms per property"
          htmlFor="max_rooms_per_property"
          required
          error={errs.max_rooms_per_property}
        >
          <Input
            id="max_rooms_per_property"
            name="max_rooms_per_property"
            type="number"
            min={0}
            required
            defaultValue={v.max_rooms_per_property ?? '0'}
          />
        </FormField>
        <FormField
          label="Max beds per room"
          htmlFor="max_beds_per_room"
          required
          error={errs.max_beds_per_room}
        >
          <Input
            id="max_beds_per_room"
            name="max_beds_per_room"
            type="number"
            min={0}
            required
            defaultValue={v.max_beds_per_room ?? '0'}
          />
        </FormField>
        <FormField
          label="Max caretakers"
          htmlFor="max_caretakers"
          required
          error={errs.max_caretakers}
        >
          <Input
            id="max_caretakers"
            name="max_caretakers"
            type="number"
            min={0}
            required
            defaultValue={v.max_caretakers ?? '0'}
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Price (PHP)"
          htmlFor="price"
          required
          error={errs.price}
          hint="0 = free (superadmin assigns it; no online payment)."
        >
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={v.price ?? '0'}
          />
        </FormField>
        <FormField
          label="Billing interval (days)"
          htmlFor="billing_interval_days"
          required
          error={errs.billing_interval_days}
        >
          <Input
            id="billing_interval_days"
            name="billing_interval_days"
            type="number"
            min={1}
            required
            defaultValue={v.billing_interval_days ?? '30'}
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Sort order"
          htmlFor="sort_order"
          error={errs.sort_order}
        >
          <Input
            id="sort_order"
            name="sort_order"
            type="number"
            min={0}
            defaultValue={v.sort_order ?? '0'}
          />
        </FormField>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={isActiveDefault}
            className="size-4"
          />
          Active (can be assigned)
        </label>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
        <Button asChild variant="outline">
          <Link href="/admin/plans">Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
