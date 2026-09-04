'use client'

import { useActionState } from 'react'

import {
  cancelExtensionAction,
  type ExtensionActionState,
} from '@/app/(protected)/extensions/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function CancelExtensionForm({
  extensionId,
  bookingId,
}: {
  extensionId: number
  bookingId: number
}) {
  const [state, action, pending] = useActionState<
    ExtensionActionState,
    FormData
  >(cancelExtensionAction, undefined)

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('Withdraw this extension request?')) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="extension_id" value={extensionId} />
      <input type="hidden" name="booking_id" value={bookingId} />
      {state?.status === 'error' && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Withdraw request
      </Button>
    </form>
  )
}
