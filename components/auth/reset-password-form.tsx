'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { updatePassword, type AuthFormState } from '@/app/(auth)/actions'
import { AuthField } from '@/components/auth/auth-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'

export function ResetPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(
    updatePassword,
    undefined,
  )

  return (
    <div className="space-y-4">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {state.error}{' '}
            <Link href="/forgot-password" className="underline">
              Request a new link
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <form action={action} className="space-y-4" noValidate>
        <AuthField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
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
        <SubmitButton pendingText="Updating…" className="w-full">
          Update password
        </SubmitButton>
      </form>
    </div>
  )
}
