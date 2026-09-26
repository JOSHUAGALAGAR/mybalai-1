'use client'

import { useActionState } from 'react'

import {
  savePackageAction,
  type PackageFormState,
} from '@/app/(protected)/admin/boosts/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BoostPackage } from '@/services/boosts.service'

/** One row: edit an existing package, or (no `pack`) add a new one. */
export function BoostPackageForm({ pack }: { pack?: BoostPackage }) {
  const [state, action, pending] = useActionState<PackageFormState, FormData>(
    savePackageAction,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const first = (k: string) => errs[k]?.[0]
  const error =
    state?.status === 'error'
      ? (first('name') ?? first('days') ?? first('price') ?? state.message)
      : null

  return (
    <form
      action={action}
      className="grid items-end gap-3 sm:grid-cols-[1fr_7rem_9rem_auto_auto]"
      noValidate
    >
      {pack && <input type="hidden" name="package_id" value={pack.packageId} />}
      <label className="text-xs font-semibold text-muted-foreground">
        Name
        <Input
          name="name"
          defaultValue={pack?.name ?? ''}
          placeholder="e.g. 7 days"
          className="mt-1 h-10"
        />
      </label>
      <label className="text-xs font-semibold text-muted-foreground">
        Days
        <Input
          name="days"
          inputMode="numeric"
          defaultValue={pack?.days ?? ''}
          className="mt-1 h-10"
        />
      </label>
      <label className="text-xs font-semibold text-muted-foreground">
        Price (₱)
        <Input
          name="price"
          inputMode="decimal"
          defaultValue={pack?.price ?? ''}
          className="mt-1 h-10"
        />
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={pack ? pack.isActive : true}
          className="size-4 accent-primary"
        />
        Available
      </label>
      <Button
        type="submit"
        size="sm"
        variant={pack ? 'outline' : 'default'}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? 'Saving…' : pack ? 'Save' : 'Add boost'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive sm:col-span-5">
          {error}
        </p>
      )}
      {state?.status === 'success' && (
        <p className="text-xs text-muted-foreground sm:col-span-5">
          {state.message}
        </p>
      )}
    </form>
  )
}
