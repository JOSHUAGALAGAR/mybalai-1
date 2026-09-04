import Link from 'next/link'

import { BookingStatusBadge } from '@/components/booking/booking-status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { BookingListItem } from '@/services/bookings.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function BookingList({
  items,
  basePath,
  showTenant = false,
  emptyTitle = 'No bookings yet',
  emptyDescription,
}: {
  items: BookingListItem[]
  basePath: string
  showTenant?: boolean
  emptyTitle?: string
  emptyDescription?: string
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((b) => (
        <li key={b.bookingId}>
          <Link
            href={`${basePath}/${b.bookingId}`}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {b.propertyName}
                <span className="text-muted-foreground">
                  {' '}
                  · {b.roomLabel}
                  {b.bedNumber ? ` · Bed ${b.bedNumber}` : ''}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {b.checkIn} → {b.checkOut} · {peso.format(b.totalAmount)}
                {showTenant && b.tenantName ? ` · ${b.tenantName}` : ''}
              </p>
            </div>
            <BookingStatusBadge code={b.statusCode} name={b.statusName} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
