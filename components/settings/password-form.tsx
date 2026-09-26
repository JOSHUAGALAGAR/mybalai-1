'use client'

import { useActionState } from 'react'

import {
  changePassword,
  type PasswordFormState,
} from '@/app/(protected)/settings/actions'
import { AuthField } from '@/components/auth/auth-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'

export function PasswordForm() {
  const [state, action] = useActionState<PasswordFormState, FormData>(
    changePassword,
    undefined,
  )
  return (
    <div className="max-w-md space-y-4">
      {state?.success && (
        <Alert>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      )}
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {/* `key` clears the fields after a successful change */}
      <form
        key={state?.success ? 'done' : 'form'}
        action={action}
        className="space-y-4"
        noValidate
      >
        <AuthField
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          errors={state?.fieldErrors?.currentPassword}
        />
        <AuthField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          errors={state?.fieldErrors?.password}
        />
        <AuthField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          errors={state?.fieldErrors?.confirmPassword}
        />
        <SubmitButton pendingText="Changing…">Change password</SubmitButton>
      </form>
      <p className="text-xs text-muted-foreground">
        Forgot your current password? Sign out, then use “Forgot password?” on
        the sign-in page.
      </p>
    </div>
  )
}
