'use client'

import { useActionState } from 'react'

import {
  respondInquiryAction,
  type InquiryActionState,
} from '@/app/(protected)/inquiries/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'

export function RespondInquiryForm({
  inquiryId,
  backTo,
}: {
  inquiryId: number
  backTo: string
}) {
  const [state, action] = useActionState<InquiryActionState, FormData>(
    respondInquiryAction,
    undefined,
  )

  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="inquiry_id" value={inquiryId} />
      <input type="hidden" name="back_to" value={backTo} />
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Textarea
        name="response"
        rows={4}
        maxLength={4000}
        required
        placeholder="Write your response…"
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="close"
          className="size-4 rounded border-input accent-primary"
        />
        Close this inquiry after responding
      </label>
      <SubmitButton pendingText="Sending…">Send response</SubmitButton>
    </form>
  )
}
