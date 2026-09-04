'use client'

import { useActionState } from 'react'

import {
  decideExtensionAction,
  type ExtensionActionState,
} from '@/app/(protected)/extensions/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function DecideExtensionPanel({
  extensionId,
  bookingId,
  backTo,
}: {
  extensionId: number
  bookingId: number
  backTo: string
}) {
  const [state, action, pending] = useActionState<
    ExtensionActionState,
    FormData
  >(decideExtensionAction, undefined)

  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(event) => {
        const to = (
          (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
        )?.value
        if (
          to === 'rejected' &&
          !window.confirm('Reject this extension request?')
        ) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="extension_id" value={extensionId} />
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="back_to" value={backTo} />

      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <Textarea
        name="response"
        rows={2}
        maxLength={2000}
        placeholder="Optional note to the tenant"
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="to" value="approved" disabled={pending}>
          Approve &amp; invoice
        </Button>
        <Button
          type="submit"
          name="to"
          value="rejected"
          variant="destructive"
          disabled={pending}
        >
          Reject
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Approving moves the check-out date and opens a pending payment for the
        extension amount.
      </p>
    </form>
  )
}
