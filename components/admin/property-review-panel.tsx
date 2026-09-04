'use client'

import { useActionState } from 'react'

import {
  setPropertyFlagsAction,
  setPropertyStatusAction,
  type AdminPropertyActionState,
} from '@/app/(protected)/admin/properties/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function PropertyReviewPanel({
  propertyId,
  statusCode,
  isVerified,
  isFeatured,
}: {
  propertyId: number
  statusCode: string | null
  isVerified: boolean
  isFeatured: boolean
}) {
  const [statusState, statusAction, statusPending] = useActionState<
    AdminPropertyActionState,
    FormData
  >(setPropertyStatusAction, undefined)
  const [flagState, flagAction, flagPending] = useActionState<
    AdminPropertyActionState,
    FormData
  >(setPropertyFlagsAction, undefined)

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Review</h3>
        <p className="text-xs text-muted-foreground">
          Current status:{' '}
          <span className="capitalize">{statusCode ?? '—'}</span>
        </p>
      </div>

      <form action={statusAction} className="space-y-2">
        <input type="hidden" name="property_id" value={propertyId} />
        {statusState?.status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{statusState.message}</AlertDescription>
          </Alert>
        )}
        {statusState?.status === 'success' && (
          <p className="text-xs text-muted-foreground">{statusState.message}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            name="status_code"
            value="active"
            size="sm"
            disabled={statusPending || statusCode === 'active'}
          >
            Approve (make active)
          </Button>
          <Button
            type="submit"
            name="status_code"
            value="inactive"
            size="sm"
            variant="outline"
            disabled={statusPending || statusCode === 'inactive'}
          >
            Set inactive
          </Button>
          <Button
            type="submit"
            name="status_code"
            value="archived"
            size="sm"
            variant="destructive"
            disabled={statusPending || statusCode === 'archived'}
          >
            Archive
          </Button>
        </div>
      </form>

      <form
        action={flagAction}
        className="space-y-2 border-t border-border pt-4"
      >
        <input type="hidden" name="property_id" value={propertyId} />
        {flagState?.status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{flagState.message}</AlertDescription>
          </Alert>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_verified"
            defaultChecked={isVerified}
            value="true"
            className="size-4"
          />
          Verified
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_featured"
            defaultChecked={isFeatured}
            value="true"
            className="size-4"
          />
          Featured on discovery
        </label>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={flagPending}
        >
          Save flags
        </Button>
      </form>
    </div>
  )
}
