'use client'

import { useActionState } from 'react'

import {
  deleteAccountAction,
  type DeleteFormState,
} from '@/app/(protected)/settings/actions'
import { AuthField } from '@/components/auth/auth-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'

export function DeleteAccountCard({
  blockers,
  role,
}: {
  blockers: string[]
  role: 'tenant' | 'landlord'
}) {
  const [state, action] = useActionState<DeleteFormState, FormData>(
    deleteAccountAction,
    undefined,
  )
  return (
    <div className="max-w-lg space-y-4 rounded-2xl border border-destructive/40 bg-card p-4">
      <div className="space-y-1 text-sm">
        <p className="font-semibold text-foreground">Delete my account</p>
        <p className="text-muted-foreground">
          This permanently removes your login, profile, photos, messages and
          {role === 'tenant' ? ' ID pictures' : ' listings'}. Past bookings and
          payments stay on record as “Deleted user” for accounting. This cannot
          be undone.
        </p>
      </div>

      {blockers.length > 0 ? (
        <Alert>
          <AlertDescription>{blockers[0]}</AlertDescription>
        </Alert>
      ) : (
        <form action={action} className="space-y-4" noValidate>
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <AuthField
            label="Your password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            errors={state?.fieldErrors?.password}
          />
          <AuthField
            label="Type DELETE to confirm"
            name="confirm"
            type="text"
            autoComplete="off"
            required
            errors={state?.fieldErrors?.confirm}
          />
          <SubmitButton variant="destructive" pendingText="Deleting…">
            Delete my account
          </SubmitButton>
        </form>
      )}
    </div>
  )
}
