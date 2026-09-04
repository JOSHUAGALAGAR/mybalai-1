'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import type { MutationState } from '@/app/(protected)/landlord/properties/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField, nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import { OWNER_PROPERTY_STATUSES } from '@/schemas/property'

type Option = { id: number; name: string }

export function PropertyForm({
  action,
  mode,
  propertyId,
  initial = {},
  typeOptions,
  submitLabel,
  pendingLabel,
  cancelHref,
}: {
  action: (state: MutationState, formData: FormData) => Promise<MutationState>
  mode: 'create' | 'edit'
  propertyId?: number
  initial?: Record<string, string>
  typeOptions: Option[]
  submitLabel: string
  pendingLabel: string
  cancelHref: string
}) {
  const [state, formAction] = useActionState<MutationState, FormData>(
    action,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const v = { ...initial, ...(state?.status === 'error' ? state.values : {}) }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {propertyId !== undefined && (
        <input type="hidden" name="property_id" value={propertyId} />
      )}

      <FormField
        label="Property name"
        htmlFor="property_name"
        required
        error={errs.property_name}
      >
        <Input
          id="property_name"
          name="property_name"
          required
          maxLength={200}
          defaultValue={v.property_name ?? ''}
        />
      </FormField>

      <FormField
        label="Address"
        htmlFor="address"
        required
        error={errs.address}
      >
        <Input
          id="address"
          name="address"
          required
          maxLength={500}
          defaultValue={v.address ?? ''}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Property type"
          htmlFor="property_type_id"
          error={errs.property_type_id}
          hint={
            typeOptions.length === 0
              ? 'No property types configured.'
              : undefined
          }
        >
          <select
            id="property_type_id"
            name="property_type_id"
            className={nativeControlClass}
            defaultValue={v.property_type_id ?? ''}
          >
            <option value="">Not specified</option>
            {typeOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </FormField>

        {mode === 'edit' && (
          <FormField
            label="Status"
            htmlFor="status_code"
            error={errs.status_code}
          >
            <select
              id="status_code"
              name="status_code"
              className={nativeControlClass}
              defaultValue={v.status_code ?? ''}
            >
              <option value="">Leave unchanged</option>
              {OWNER_PROPERTY_STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Contact number"
          htmlFor="contact_number"
          error={errs.contact_number}
        >
          <Input
            id="contact_number"
            name="contact_number"
            maxLength={40}
            defaultValue={v.contact_number ?? ''}
          />
        </FormField>
        <FormField
          label="Monthly payment rule"
          htmlFor="monthly_payment_rule"
          error={errs.monthly_payment_rule}
        >
          <Input
            id="monthly_payment_rule"
            name="monthly_payment_rule"
            maxLength={200}
            defaultValue={v.monthly_payment_rule ?? ''}
          />
        </FormField>
      </div>

      <FormField
        label="Cover image URL"
        htmlFor="property_image"
        hint="Paste an image link. File uploads arrive with Supabase Storage."
        error={errs.property_image}
      >
        <Input
          id="property_image"
          name="property_image"
          type="url"
          inputMode="url"
          defaultValue={v.property_image ?? ''}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Latitude" htmlFor="latitude" error={errs.latitude}>
          <Input
            id="latitude"
            name="latitude"
            inputMode="decimal"
            defaultValue={v.latitude ?? ''}
          />
        </FormField>
        <FormField label="Longitude" htmlFor="longitude" error={errs.longitude}>
          <Input
            id="longitude"
            name="longitude"
            inputMode="decimal"
            defaultValue={v.longitude ?? ''}
          />
        </FormField>
        <FormField
          label="Google Place ID"
          htmlFor="google_place_id"
          error={errs.google_place_id}
        >
          <Input
            id="google_place_id"
            name="google_place_id"
            maxLength={255}
            defaultValue={v.google_place_id ?? ''}
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
          rows={3}
          maxLength={4000}
          defaultValue={v.description ?? ''}
        />
      </FormField>
      <FormField
        label="Booking policy"
        htmlFor="booking_policy"
        error={errs.booking_policy}
      >
        <Textarea
          id="booking_policy"
          name="booking_policy"
          rows={3}
          maxLength={2000}
          defaultValue={v.booking_policy ?? ''}
        />
      </FormField>
      <FormField
        label="House rules"
        htmlFor="house_rules"
        error={errs.house_rules}
      >
        <Textarea
          id="house_rules"
          name="house_rules"
          rows={3}
          maxLength={4000}
          defaultValue={v.house_rules ?? ''}
        />
      </FormField>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton pendingText={pendingLabel}>{submitLabel}</SubmitButton>
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
