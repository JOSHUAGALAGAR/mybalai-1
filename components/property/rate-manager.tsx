'use client'

import { useActionState } from 'react'

import {
  createRateAction,
  deleteRateAction,
  updateRateAction,
  type MutationState,
} from '@/app/(protected)/landlord/properties/actions'
import { ConfirmButton } from '@/components/property/confirm-button'
import { FormField, nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { RATE_PERIODS } from '@/schemas/rental-rate'

type RoomOption = { room_id: number; label: string }

export type RateView = {
  rate_id: number
  room_id: number
  room_label: string
  period: string
  price: number
  valid_from: string
  valid_until: string | null
}

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

export function RateManager({
  propertyId,
  rooms,
  rates,
}: {
  propertyId: number
  rooms: RoomOption[]
  rates: RateView[]
}) {
  const [state, formAction] = useActionState<MutationState, FormData>(
    createRateAction,
    undefined,
  )

  if (rooms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a room before setting rental rates.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rental rates yet.</p>
      ) : (
        <ul className="space-y-2">
          {rates.map((rate) => (
            <RateRow
              key={rate.rate_id}
              propertyId={propertyId}
              rate={rate}
              rooms={rooms}
            />
          ))}
        </ul>
      )}

      <form
        action={formAction}
        className="grid gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2 lg:grid-cols-5"
        noValidate
      >
        <input type="hidden" name="property_id" value={propertyId} />
        <RateFields
          idPrefix="new-rate"
          rooms={rooms}
          errs={state?.status === 'error' ? state.fieldErrors : undefined}
        />
        <div className="flex items-end lg:col-span-5">
          {state?.status === 'error' && (
            <p className="mr-3 text-xs text-destructive">{state.message}</p>
          )}
          {state?.status === 'success' && (
            <p className="mr-3 text-xs text-muted-foreground">
              {state.message}
            </p>
          )}
          <SubmitButton pendingText="Adding…" variant="secondary">
            Add rate
          </SubmitButton>
        </div>
      </form>
    </div>
  )
}

function RateRow({
  propertyId,
  rate,
  rooms,
}: {
  propertyId: number
  rate: RateView
  rooms: RoomOption[]
}) {
  const [state, formAction] = useActionState<MutationState, FormData>(
    updateRateAction,
    undefined,
  )

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-foreground">
          {rate.room_label} · <span className="capitalize">{rate.period}</span>{' '}
          · {peso.format(rate.price)}
        </span>
        <ConfirmButton
          action={deleteRateAction}
          confirm="Delete this rate? Past bookings keep their original price."
          hidden={{ property_id: propertyId, rate_id: rate.rate_id }}
          variant="ghost"
          size="sm"
        >
          Delete
        </ConfirmButton>
      </div>
      <form
        action={formAction}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        noValidate
      >
        <input type="hidden" name="property_id" value={propertyId} />
        <input type="hidden" name="rate_id" value={rate.rate_id} />
        <RateFields
          idPrefix={`rate-${rate.rate_id}`}
          rooms={rooms}
          defaults={{
            room_id: String(rate.room_id),
            period: rate.period,
            price: String(rate.price),
            valid_from: rate.valid_from,
            valid_until: rate.valid_until ?? '',
          }}
          errs={state?.status === 'error' ? state.fieldErrors : undefined}
        />
        <div className="flex items-end lg:col-span-5">
          {state?.status === 'error' && (
            <p className="mr-3 text-xs text-destructive">{state.message}</p>
          )}
          <SubmitButton pendingText="Saving…" variant="outline">
            Save
          </SubmitButton>
        </div>
      </form>
    </li>
  )
}

function RateFields({
  idPrefix,
  rooms,
  defaults = {},
  errs,
}: {
  idPrefix: string
  rooms: RoomOption[]
  defaults?: Record<string, string>
  errs?: Record<string, string[]>
}) {
  const fid = (name: string) => `${idPrefix}-${name}`
  return (
    <>
      <FormField label="Room" htmlFor={fid('room_id')} error={errs?.room_id}>
        <select
          id={fid('room_id')}
          name="room_id"
          className={nativeControlClass}
          defaultValue={defaults.room_id ?? ''}
        >
          <option value="">Select…</option>
          {rooms.map((r) => (
            <option key={r.room_id} value={r.room_id}>
              {r.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Period" htmlFor={fid('period')} error={errs?.period}>
        <select
          id={fid('period')}
          name="period"
          className={nativeControlClass}
          defaultValue={defaults.period ?? 'monthly'}
        >
          {RATE_PERIODS.map((p) => (
            <option key={p} value={p} className="capitalize">
              {p}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Price (PHP)" htmlFor={fid('price')} error={errs?.price}>
        <Input
          id={fid('price')}
          name="price"
          inputMode="decimal"
          defaultValue={defaults.price ?? ''}
        />
      </FormField>
      <FormField
        label="Valid from"
        htmlFor={fid('valid_from')}
        error={errs?.valid_from}
      >
        <Input
          id={fid('valid_from')}
          name="valid_from"
          type="date"
          defaultValue={defaults.valid_from ?? ''}
        />
      </FormField>
      <FormField
        label="Valid until"
        htmlFor={fid('valid_until')}
        error={errs?.valid_until}
      >
        <Input
          id={fid('valid_until')}
          name="valid_until"
          type="date"
          defaultValue={defaults.valid_until ?? ''}
        />
      </FormField>
    </>
  )
}
