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
import { ROOM_STATUSES } from '@/schemas/room'

type Option = { id: number; name: string }

export function RoomForm({
  action,
  mode,
  propertyId,
  roomId,
  initial = {},
  typeOptions,
  submitLabel,
  pendingLabel,
  cancelHref,
}: {
  action: (state: MutationState, formData: FormData) => Promise<MutationState>
  mode: 'create' | 'edit'
  propertyId: number
  roomId?: number
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
      <input type="hidden" name="property_id" value={propertyId} />
      {roomId !== undefined && (
        <input type="hidden" name="room_id" value={roomId} />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Room number"
          htmlFor="room_number"
          error={errs.room_number}
        >
          <Input
            id="room_number"
            name="room_number"
            maxLength={40}
            defaultValue={v.room_number ?? ''}
          />
        </FormField>
        <FormField label="Room name" htmlFor="room_name" error={errs.room_name}>
          <Input
            id="room_name"
            name="room_name"
            maxLength={120}
            defaultValue={v.room_name ?? ''}
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Room type"
          htmlFor="room_type_id"
          error={errs.room_type_id}
        >
          <select
            id="room_type_id"
            name="room_type_id"
            className={nativeControlClass}
            defaultValue={v.room_type_id ?? ''}
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
              {ROOM_STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Floor" htmlFor="floor" error={errs.floor}>
          <Input
            id="floor"
            name="floor"
            maxLength={40}
            defaultValue={v.floor ?? ''}
          />
        </FormField>
        <FormField label="Area (sqm)" htmlFor="area_sqm" error={errs.area_sqm}>
          <Input
            id="area_sqm"
            name="area_sqm"
            inputMode="decimal"
            defaultValue={v.area_sqm ?? ''}
          />
        </FormField>
        <FormField
          label="Max occupants"
          htmlFor="max_occupants"
          required
          error={errs.max_occupants}
        >
          <Input
            id="max_occupants"
            name="max_occupants"
            inputMode="numeric"
            defaultValue={v.max_occupants ?? '1'}
          />
        </FormField>
      </div>

      <FormField
        label="Cover image URL"
        htmlFor="room_image"
        error={errs.room_image}
      >
        <Input
          id="room_image"
          name="room_image"
          type="url"
          inputMode="url"
          defaultValue={v.room_image ?? ''}
        />
      </FormField>

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

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton pendingText={pendingLabel}>{submitLabel}</SubmitButton>
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
