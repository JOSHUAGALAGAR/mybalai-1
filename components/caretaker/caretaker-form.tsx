'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import {
  createCaretakerAction,
  type CaretakerFormState,
} from '@/app/(protected)/landlord/caretakers/actions'
import { AuthField } from '@/components/auth/auth-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'

export function CaretakerForm() {
  const [state, action] = useActionState<CaretakerFormState, FormData>(
    createCaretakerAction,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const v = state?.status === 'error' ? (state.values ?? {}) : {}

  return (
    <div className="max-w-md space-y-4">
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <form action={action} className="space-y-4" noValidate>
        <AuthField
          label="Full name"
          name="fullName"
          type="text"
          required
          defaultValue={v.fullName}
          errors={errs.fullName}
        />
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="off"
          required
          defaultValue={v.email}
          errors={errs.email}
        />
        <AuthField
          label="Temporary password"
          name="password"
          type="text"
          autoComplete="off"
          required
          hint="Share this with the caretaker. They can change it after signing in."
          errors={errs.password}
        />
        <div className="flex items-center gap-3">
          <SubmitButton pendingText="Creating…">Create caretaker</SubmitButton>
          <Button asChild variant="outline">
            <Link href="/landlord/caretakers">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
