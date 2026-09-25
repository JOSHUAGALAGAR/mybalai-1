import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { AdminVerificationItem } from '@/services/verification.service'

const STATUS_BADGE = {
  pending: { label: 'Waiting', variant: 'secondary' },
  approved: { label: 'Verified', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
} as const

export function VerificationTable({
  items,
}: {
  items: AdminVerificationItem[]
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing here"
        description="No ID submissions in this list."
      />
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Tenant</th>
            <th className="px-3 py-2 font-medium">ID type</th>
            <th className="px-3 py-2 font-medium">Submitted</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((v) => {
            const badge = STATUS_BADGE[v.status]
            return (
              <tr key={v.verificationId} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/verifications/${v.verificationId}`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {v.name}
                  </Link>
                  {v.email && (
                    <span className="block text-xs text-muted-foreground">
                      {v.email}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{v.idTypeLabel}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(v.submittedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
