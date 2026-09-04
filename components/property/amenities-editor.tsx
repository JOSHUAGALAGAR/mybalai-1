'use client'

import { useActionState } from 'react'

import {
  saveAmenitiesAction,
  type MutationState,
} from '@/app/(protected)/landlord/properties/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import type { AmenityWithCategory } from '@/repositories/reference.repository'

export function AmenitiesEditor({
  propertyId,
  amenities,
  selectedIds,
}: {
  propertyId: number
  amenities: AmenityWithCategory[]
  selectedIds: number[]
}) {
  const [state, formAction] = useActionState<MutationState, FormData>(
    saveAmenitiesAction,
    undefined,
  )
  const selected = new Set(selectedIds)

  const groups = new Map<string, AmenityWithCategory[]>()
  for (const amenity of amenities) {
    const key = amenity.category_name ?? 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(amenity)
  }

  if (amenities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No amenities are configured yet.
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="property_id" value={propertyId} />

      {state?.status === 'success' && (
        <Alert>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {[...groups.entries()].map(([category, items]) => (
          <fieldset key={category} className="space-y-1.5">
            <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {category}
            </legend>
            {items.map((amenity) => (
              <label
                key={amenity.amenity_id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="amenity_ids"
                  value={amenity.amenity_id}
                  defaultChecked={selected.has(amenity.amenity_id)}
                  className="size-4 rounded border-input accent-primary"
                />
                {amenity.amenity_name}
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <SubmitButton pendingText="Saving…" variant="secondary">
        Save amenities
      </SubmitButton>
    </form>
  )
}
