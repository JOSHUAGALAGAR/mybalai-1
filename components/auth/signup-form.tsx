'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { signup, type AuthFormState } from '@/app/(auth)/actions'
import { AuthDivider } from '@/components/auth/auth-divider'
import { AuthField } from '@/components/auth/auth-field'
import { GoogleButton } from '@/components/auth/google-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'

export function SignupForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(
    signup,
    undefined,
  )

  return (
    <div className="space-y-4">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form action={action} className="space-y-4" noValidate>
        <AuthField
          label="Full name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          defaultValue={state?.values?.fullName}
          errors={state?.fieldErrors?.fullName}
        />
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.values?.email}
          errors={state?.fieldErrors?.email}
        />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          errors={state?.fieldErrors?.password}
        />
        <AuthField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          errors={state?.fieldErrors?.confirmPassword}
        />

        <SubmitButton pendingText="Creating account…" className="w-full">
          Create account
        </SubmitButton>
      </form>

      <AuthDivider label="or" />
      <GoogleButton label="Sign up with Google" />

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-foreground underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
