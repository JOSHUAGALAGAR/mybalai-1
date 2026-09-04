'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { requestPasswordReset, type AuthFormState } from '@/app/(auth)/actions'
import { AuthField } from '@/components/auth/auth-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'

export function ForgotPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    undefined,
  )

  return (
    <div className="space-y-4">
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

      <form action={action} className="space-y-4" noValidate>
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.values?.email}
          errors={state?.fieldErrors?.email}
        />
        <SubmitButton pendingText="Sending…" className="w-full">
          Send reset link
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
