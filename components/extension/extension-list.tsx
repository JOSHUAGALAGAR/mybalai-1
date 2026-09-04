import Link from 'next/link'

import { CancelExtensionForm } from '@/components/extension/cancel-extension-form'
import { DecideExtensionPanel } from '@/components/extension/decide-extension-panel'
import { ExtensionStatusBadge } from '@/components/extension/extension-status-badge'
import type { ExtensionItem } from '@/services/extensions.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function ExtensionList({
  items,
  bookingId,
  mode,
}: {
  items: ExtensionItem[]
  bookingId: number
  mode: { kind: 'tenant' } | { kind: 'manage'; backTo: string }
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No extension requests for this booking.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {items.map((e) => (
        <li
          key={e.extensionId}
          className="rounded-lg border border-border bg-card p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {e.previousCheckOut} → {e.newCheckOut}
            </span>
            <ExtensionStatusBadge status={e.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Amount: {peso.format(e.amount)}
            {e.paymentId != null && (
              <>
                {' · '}
                <Link
                  href={
                    mode.kind === 'tenant'
                      ? `/payments/${e.paymentId}`
                      : `${mode.backTo.replace('/bookings', '/payments')}/${e.paymentId}`
                  }
                  className="underline"
                >
                  view payment
                </Link>
              </>
            )}
          </p>
          {e.tenantMessage && (
            <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
              “{e.tenantMessage}”
            </p>
          )}
          {e.managerResponse && (
            <p className="mt-2 text-sm text-foreground">
              <span className="text-muted-foreground">Response: </span>
              {e.managerResponse}
            </p>
          )}
          {e.decidedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {e.status} {new Date(e.decidedAt).toLocaleDateString()}
              {e.decidedByName ? ` by ${e.decidedByName}` : ''}
            </p>
          )}

          {e.status === 'pending' && mode.kind === 'manage' && (
            <div className="mt-3">
              <DecideExtensionPanel
                extensionId={e.extensionId}
                bookingId={bookingId}
                backTo={mode.backTo}
              />
            </div>
          )}
          {e.canCancel && mode.kind === 'tenant' && (
            <div className="mt-3">
              <CancelExtensionForm
                extensionId={e.extensionId}
                bookingId={bookingId}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
