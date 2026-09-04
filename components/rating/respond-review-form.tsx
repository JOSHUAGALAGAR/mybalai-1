'use client'

import { useActionState } from 'react'

import {
  respondReviewAction,
  type ReviewActionState,
} from '@/app/(protected)/reviews/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'

export function RespondReviewForm({ ratingId }: { ratingId: number }) {
  const [state, action] = useActionState<ReviewActionState, FormData>(
    respondReviewAction,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}

  return (
    <form action={action} className="mt-3 space-y-2" noValidate>
      <input type="hidden" name="rating_id" value={ratingId} />
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Textarea
        name="response"
        rows={3}
        maxLength={2000}
        required
        placeholder="Reply publicly to this review"
        aria-invalid={errs.response?.length ? true : undefined}
      />
      {errs.response?.map((m) => (
        <p key={m} className="text-xs font-medium text-destructive">
          {m}
        </p>
      ))}
      <SubmitButton pendingText="Posting…" variant="outline">
        Post response
      </SubmitButton>
    </form>
  )
}
