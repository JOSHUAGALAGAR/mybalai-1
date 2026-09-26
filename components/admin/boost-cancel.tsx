'use client'

import { useActionState, useState } from 'react'

import {
  cancelBoostAction,
  type PackageFormState,
} from '@/app/(protected)/admin/boosts/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Stop a boost early (e.g. a listing that broke the rules), noting whether it was refunded. */
export function BoostCancel({ boostId }: { boostId: number }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<PackageFormState, FormData>(
    cancelBoostAction,
    undefined,
  )
  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Cancel
      </Button>
    )
  }
  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2"
      noValidate
    >
      <input type="hidden" name="boost_id" value={boostId} />
      <Input
        name="reason"
        placeholder="Why?"
        className="h-9 w-40"
        aria-label="Reason"
      />
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          name="refunded"
          className="size-4 accent-primary"
        />{' '}
        Refunded
      </label>
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? '…' : 'Confirm'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(false)}
      >
        Back
      </Button>
      {state?.status === 'error' && (
        <span className="w-full text-xs text-destructive">{state.message}</span>
      )}
    </form>
  )
}
