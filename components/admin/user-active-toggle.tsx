'use client'

import { useActionState } from 'react'

import {
  setUserActiveAction,
  type UserActionState,
} from '@/app/(protected)/admin/users/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function UserActiveToggle({
  userId,
  isActive,
}: {
  userId: number
  isActive: boolean
}) {
  const [state, action, pending] = useActionState<UserActionState, FormData>(
    setUserActiveAction,
    undefined,
  )

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          isActive &&
          !window.confirm('Deactivate this account? They lose all access.')
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <input
        type="hidden"
        name="is_active"
        value={isActive ? 'false' : 'true'}
      />
      {state?.status === 'error' && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        size="sm"
        variant={isActive ? 'destructive' : 'default'}
        disabled={pending}
      >
        {isActive ? 'Deactivate' : 'Reactivate'}
      </Button>
    </form>
  )
}
