'use client'

import { useActionState } from 'react'

import {
  addBedAction,
  deleteBedAction,
  updateBedStatusAction,
  type MutationState,
} from '@/app/(protected)/landlord/properties/actions'
import { ConfirmButton } from '@/components/property/confirm-button'
import { StatusBadge } from '@/components/property/property-status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormField, nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { BED_STATUSES } from '@/schemas/bed'

export type BedView = {
  bed_id: number
  bed_number: string
  status_code: string | null
  status_label: string | null
}

export function BedManager({
  propertyId,
  roomId,
  beds,
  canManage = true,
}: {
  propertyId: number
  roomId: number
  beds: BedView[]
  /** false for caretakers: status changes only, no add / delete. */
  canManage?: boolean
}) {
  const [state, formAction] = useActionState<MutationState, FormData>(
    addBedAction,
    undefined,
  )

  return (
    <div className="space-y-4">
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

      {beds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No beds in this room yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {beds.map((bed) => (
            <li
              key={bed.bed_id}
              className="flex flex-wrap items-center gap-3 px-3 py-2"
            >
              <span className="text-sm font-medium text-foreground">
                Bed {bed.bed_number}
              </span>
              <StatusBadge code={bed.status_code} label={bed.status_label} />
              <div className="ml-auto flex items-center gap-2">
                <form action={updateBedStatusAction}>
                  <input type="hidden" name="property_id" value={propertyId} />
                  <input type="hidden" name="room_id" value={roomId} />
                  <input type="hidden" name="bed_id" value={bed.bed_id} />
                  <select
                    name="status_code"
                    aria-label={`Status for bed ${bed.bed_number}`}
                    className={`${nativeControlClass} h-8 w-36`}
                    defaultValue={bed.status_code ?? 'available'}
                    onChange={(event) =>
                      event.currentTarget.form?.requestSubmit()
                    }
                  >
                    {BED_STATUSES.map((s) => (
                      <option key={s} value={s} className="capitalize">
                        {s}
                      </option>
                    ))}
                  </select>
                </form>
                {canManage && (
                  <ConfirmButton
                    action={deleteBedAction}
                    confirm={`Delete bed ${bed.bed_number}?`}
                    hidden={{
                      property_id: propertyId,
                      room_id: roomId,
                      bed_id: bed.bed_id,
                    }}
                    variant="ghost"
                    size="sm"
                  >
                    Delete
                  </ConfirmButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!canManage && beds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          You can update bed status. Adding or removing beds is done by the
          property owner.
        </p>
      )}

      {canManage && (
        <form
          action={formAction}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border p-3"
          noValidate
        >
          <input type="hidden" name="property_id" value={propertyId} />
          <input type="hidden" name="room_id" value={roomId} />
          <div className="w-40">
            <FormField
              label="Bed number"
              htmlFor="bed_number"
              required
              error={
                state?.status === 'error'
                  ? state.fieldErrors?.bed_number
                  : undefined
              }
            >
              <Input
                id="bed_number"
                name="bed_number"
                required
                maxLength={40}
              />
            </FormField>
          </div>
          <div className="w-40">
            <FormField label="Status" htmlFor="status_code">
              <select
                id="status_code"
                name="status_code"
                className={nativeControlClass}
                defaultValue="available"
              >
                {BED_STATUSES.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <SubmitButton pendingText="Adding…" variant="secondary">
            Add bed
          </SubmitButton>
        </form>
      )}
    </div>
  )
}
