'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import {
  createLandlordAction,
  type LandlordActionState,
} from '@/app/(protected)/admin/landlords/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'

export function LandlordForm() {
  const [state, action] = useActionState<LandlordActionState, FormData>(
    createLandlordAction,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const v = state?.status === 'error' ? (state.values ?? {}) : {}

  return (
    <form action={action} className="max-w-xl space-y-5" noValidate>
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <FormField
        label="Full name"
        htmlFor="full_name"
        required
        error={errs.full_name}
      >
        <Input
          id="full_name"
          name="full_name"
          required
          maxLength={120}
          defaultValue={v.full_name ?? ''}
        />
      </FormField>
      <FormField label="Email" htmlFor="email" required error={errs.email}>
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={v.email ?? ''}
        />
      </FormField>
      <FormField
        label="Temporary password"
        htmlFor="password"
        required
        error={errs.password}
        hint="Share it with the landlord; they can change it after signing in."
      >
        <Input
          id="password"
          name="password"
          type="text"
          required
          minLength={8}
          defaultValue={v.password ?? ''}
        />
      </FormField>
      <FormField
        label="Business name"
        htmlFor="business_name"
        error={errs.business_name}
      >
        <Input
          id="business_name"
          name="business_name"
          maxLength={160}
          defaultValue={v.business_name ?? ''}
        />
      </FormField>
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Creating…">Create landlord</SubmitButton>
        <Button asChild variant="outline">
          <Link href="/admin/landlords">Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
