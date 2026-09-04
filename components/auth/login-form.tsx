'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { login, type AuthFormState } from '@/app/(auth)/actions'
import { AuthField } from '@/components/auth/auth-field'
import { AuthDivider } from '@/components/auth/auth-divider'
import { GoogleButton } from '@/components/auth/google-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'

export function LoginForm({
  next,
  notice,
}: {
  next?: string
  notice?: string
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    login,
    undefined,
  )

  return (
    <div className="space-y-4">
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form action={action} className="space-y-4" noValidate>
        {next && <input type="hidden" name="next" value={next} />}

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
          autoComplete="current-password"
          required
          errors={state?.fieldErrors?.password}
          labelRight={
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </Link>
          }
        />

        <SubmitButton pendingText="Signing in…" className="w-full">
          Sign in
        </SubmitButton>
      </form>

      <AuthDivider label="or" />
      <GoogleButton next={next} />

      <p className="text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link href="/signup" className="font-medium text-foreground underline">
          Create one
        </Link>
      </p>
    </div>
  )
}
