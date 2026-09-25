'use client'

import { useActionState } from 'react'

import {
  decideVerificationAction,
  type VerificationActionState,
} from '@/app/(protected)/admin/verifications/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/** Approve, or reject with a reason the tenant will see. */
export function VerificationReview({
  verificationId,
}: {
  verificationId: number
}) {
  const [state, action, pending] = useActionState<
    VerificationActionState,
    FormData
  >(decideVerificationAction, undefined)
  const reasonError = state?.fieldErrors?.reason?.[0]

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form
        action={action}
        className="space-y-3 rounded-lg border border-border p-4"
        onSubmit={(e) => {
          if (
            !window.confirm(
              'Approve this ID? The tenant gets a Verified badge.',
            )
          ) {
            e.preventDefault()
          }
        }}
      >
        <input type="hidden" name="verification_id" value={verificationId} />
        <input type="hidden" name="decision" value="approve" />
        <h3 className="text-sm font-semibold">Approve</h3>
        <p className="text-muted-foreground text-xs">
          The name and photo on the ID match the account, and both sides are
          clear and readable.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Approve and verify'}
        </Button>
      </form>

      <form
        action={action}
        className="space-y-3 rounded-lg border border-border p-4"
      >
        <input type="hidden" name="verification_id" value={verificationId} />
        <input type="hidden" name="decision" value="reject" />
        <h3 className="text-sm font-semibold">Reject</h3>
        <label htmlFor="reason" className="text-muted-foreground block text-xs">
          Tell the tenant what to fix (they see this and can upload again).
        </label>
        <Textarea
          id="reason"
          name="reason"
          rows={3}
          maxLength={500}
          required
          defaultValue={state?.reason ?? ''}
          placeholder="e.g. The back of the ID is blurry — please retake it in good light."
          aria-invalid={reasonError ? true : undefined}
        />
        {reasonError && (
          <p className="text-destructive text-xs font-medium">{reasonError}</p>
        )}
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? 'Saving…' : 'Reject'}
        </Button>
      </form>

      {state?.status === 'error' && !reasonError && (
        <Alert variant="destructive" className="md:col-span-2">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
