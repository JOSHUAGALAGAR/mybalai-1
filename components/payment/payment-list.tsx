import Link from 'next/link'

import { PaymentStatusBadge } from '@/components/payment/payment-status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { PaymentListItem } from '@/services/payments.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function PaymentList({
  items,
  basePath,
  showPayer = false,
  emptyTitle = 'No payments yet',
  emptyDescription,
}: {
  items: PaymentListItem[]
  basePath: string
  showPayer?: boolean
  emptyTitle?: string
  emptyDescription?: string
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((p) => (
        <li key={p.paymentId}>
          <Link
            href={`${basePath}/${p.paymentId}`}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {peso.format(p.amount)}
                <span className="text-muted-foreground">
                  {' '}
                  · {p.methodName ?? '—'}
                  {p.propertyName ? ` · ${p.propertyName}` : ''}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                #{p.paymentId}
                {p.reference ? ` · ref ${p.reference}` : ''}
                {showPayer && p.payerName ? ` · ${p.payerName}` : ''}
                {` · ${new Date(p.submittedAt).toLocaleDateString()}`}
              </p>
            </div>
            <PaymentStatusBadge code={p.statusCode} name={p.statusName} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
