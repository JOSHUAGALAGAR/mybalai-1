'use client'

import { useActionState } from 'react'

import {
  updateProfile,
  type ProfileFormState,
} from '@/app/(protected)/settings/actions'
import { AuthField } from '@/components/auth/auth-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'

type Props = {
  initial: { fullName: string; phone: string; address: string }
}

export function ProfileForm({ initial }: Props) {
  const [state, action] = useActionState<ProfileFormState, FormData>(
    updateProfile,
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

      <form action={action} className="space-y-4" noValidate>
        <AuthField
          label="Full name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          defaultValue={initial.fullName}
          errors={state?.fieldErrors?.fullName}
        />
        <AuthField
          label="Phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={initial.phone}
          errors={state?.fieldErrors?.phone}
        />
        <AuthField
          label="Address"
          name="address"
          type="text"
          autoComplete="street-address"
          defaultValue={initial.address}
          errors={state?.fieldErrors?.address}
        />
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </form>
    </div>
  )
}
