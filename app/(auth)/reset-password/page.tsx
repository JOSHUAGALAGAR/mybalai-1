import type { Metadata } from 'next'

import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export const metadata: Metadata = { title: 'Set a new password' }

// Reached via the password-reset email → /auth/callback (which establishes a
// recovery session) → here. `proxy.ts` requires a session for this path, so a
// cold visit is bounced to /login.
export default function ResetPasswordPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Set a new password
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a new password for your account.
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  )
}
