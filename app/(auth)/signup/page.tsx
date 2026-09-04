import type { Metadata } from 'next'

import { SignupForm } from '@/components/auth/signup-form'

export const metadata: Metadata = { title: 'Create account' }

export default function SignupPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign up as a tenant to browse and book properties. Landlord and
          caretaker accounts are set up separately.
        </p>
      </div>
      <SignupForm />
    </div>
  )
}
