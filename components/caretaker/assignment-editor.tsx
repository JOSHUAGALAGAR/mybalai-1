'use client'

import { useActionState } from 'react'

import {
  updateAssignmentsAction,
  type CaretakerFormState,
} from '@/app/(protected)/landlord/caretakers/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'

type PropertyOption = {
  property_id: number
  property_name: string
  address: string
  assigned: boolean
}

export function AssignmentEditor({
  caretakerId,
  properties,
}: {
  caretakerId: number
  properties: PropertyOption[]
}) {
  const [state, action] = useActionState<CaretakerFormState, FormData>(
    updateAssignmentsAction,
    undefined,
  )

  if (properties.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You have no properties to assign yet. Create a property first.
      </p>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="caretaker_id" value={caretakerId} />

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

      <ul className="divide-y divide-border rounded-lg border border-border">
        {properties.map((p) => (
          <li key={p.property_id}>
            <label className="flex items-start gap-3 px-4 py-3 text-sm">
              <input
                type="checkbox"
                name="property_ids"
                value={p.property_id}
                defaultChecked={p.assigned}
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <span>
                <span className="font-medium text-foreground">
                  {p.property_name}
                </span>
                <span className="block text-muted-foreground">{p.address}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <SubmitButton pendingText="Saving…">Save assignments</SubmitButton>
    </form>
  )
}
