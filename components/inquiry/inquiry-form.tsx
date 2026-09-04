'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import {
  createInquiryAction,
  type InquiryActionState,
} from '@/app/(protected)/inquiries/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'

export function InquiryForm({
  propertyId,
  propertyName,
}: {
  propertyId: number
  propertyName: string
}) {
  const [state, action] = useActionState<InquiryActionState, FormData>(
    createInquiryAction,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const v = state?.status === 'error' ? (state.values ?? {}) : {}

  return (
    <form action={action} className="max-w-xl space-y-5" noValidate>
      <input type="hidden" name="property_id" value={propertyId} />
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <FormField
        label="Subject"
        htmlFor="subject"
        required
        error={errs.subject}
      >
        <Input
          id="subject"
          name="subject"
          maxLength={200}
          required
          defaultValue={v.subject ?? ''}
        />
      </FormField>
      <FormField
        label="Your question"
        htmlFor="message"
        required
        error={errs.message}
      >
        <Textarea
          id="message"
          name="message"
          rows={5}
          maxLength={4000}
          required
          defaultValue={v.message ?? ''}
        />
      </FormField>

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Sending…">Send inquiry</SubmitButton>
        <Button asChild variant="outline">
          <Link href={`/discover/${propertyId}`}>Cancel</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Your inquiry about {propertyName} goes to the landlord.
      </p>
    </form>
  )
}
