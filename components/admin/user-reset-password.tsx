'use client'

import { KeyRound } from 'lucide-react'
import { useActionState, useState } from 'react'

import {
  resetUserPasswordAction,
  type ResetPasswordState,
} from '@/app/(protected)/admin/users/actions'
import {
  CredentialsDialog,
  type Credentials,
} from '@/components/admin/credentials-dialog'
import { Button } from '@/components/ui/button'

/**
 * "Reset password" for a locked-out user: asks first, then shows the new temporary password once in
 * a window that stays open until the admin has saved it (it is never stored).
 */
export function UserResetPassword({
  userId,
  name,
}: {
  userId: number
  name: string
}) {
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(
    async (prev, formData) => {
      const result = await resetUserPasswordAction(prev, formData)
      if (result?.status === 'issued') {
        setCredentials({
          email: result.email,
          password: result.password,
          reason: 'reset',
        })
      }
      return result
    },
    undefined,
  )

  return (
    <>
      <CredentialsDialog
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />
      <form
        action={action}
        onSubmit={(e) => {
          if (
            !window.confirm(
              `Issue a new temporary password for ${name}? Their current password stops working right away.`,
            )
          ) {
            e.preventDefault()
          }
        }}
      >
        <input type="hidden" name="user_id" value={userId} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pending}
          aria-busy={pending}
          aria-label={`Reset password for ${name}`}
        >
          <KeyRound className="size-4" aria-hidden />
          {pending ? 'Resetting…' : 'Reset password'}
        </Button>
        {state?.status === 'error' && (
          <p role="alert" className="mt-1 max-w-56 text-xs text-destructive">
            {state.message}
          </p>
        )}
      </form>
    </>
  )
}
