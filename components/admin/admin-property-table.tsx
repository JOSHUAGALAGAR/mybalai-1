import Link from 'next/link'

import { StatusBadge } from '@/components/property/property-status-badge'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { AdminPropertyListItem } from '@/services/admin.service'

export function AdminPropertyTable({
  items,
}: {
  items: AdminPropertyListItem[]
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No properties here"
        description="Nothing matches this status filter."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Property</th>
            <th className="px-3 py-2 font-medium">Owner</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Flags</th>
            <th className="px-3 py-2 font-medium">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((p) => (
            <tr key={p.propertyId} className="hover:bg-muted/30">
              <td className="px-3 py-2">
                <Link
                  href={`/admin/properties/${p.propertyId}`}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {p.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {p.address}
                </p>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {p.ownerName}
                {p.ownerBusiness && (
                  <span className="block text-xs">{p.ownerBusiness}</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {p.typeName ?? '—'}
              </td>
              <td className="px-3 py-2">
                <StatusBadge code={p.statusCode} label={p.statusName} />
              </td>
              <td className="px-3 py-2">
                <span className="flex flex-wrap gap-1">
                  {p.isVerified && <Badge variant="secondary">Verified</Badge>}
                  {p.isFeatured && <Badge variant="outline">Featured</Badge>}
                  {!p.isVerified && !p.isFeatured && (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {new Date(p.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
