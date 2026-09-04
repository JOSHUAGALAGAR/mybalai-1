import Link from 'next/link'

import { InquiryStatusBadge } from '@/components/inquiry/inquiry-status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { InquiryListItem } from '@/services/inquiries.service'

export function InquiryList({
  items,
  basePath,
  showTenant = false,
  emptyTitle = 'No inquiries',
  emptyDescription,
}: {
  items: InquiryListItem[]
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
      {items.map((q) => (
        <li key={q.inquiryId}>
          <Link
            href={`${basePath}/${q.inquiryId}`}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {q.subject}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {q.propertyName ?? `Property #${q.propertyId}`}
                {showTenant && q.tenantName ? ` · ${q.tenantName}` : ''}
                {` · ${new Date(q.createdAt).toLocaleDateString()}`}
              </p>
            </div>
            <InquiryStatusBadge status={q.status} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
