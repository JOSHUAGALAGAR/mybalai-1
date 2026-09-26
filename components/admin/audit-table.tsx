import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { auditActionLabel } from '@/lib/audit/actions'
import type { AuditEntry } from '@/repositories/audit.repository'

const stamp = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

function tone(
  action: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (/deactivated|rejected|deleted/.test(action)) return 'destructive'
  if (/viewed|exported/.test(action)) return 'outline'
  return 'secondary'
}

export function AuditTable({ rows }: { rows: AuditEntry[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing logged yet"
        description="Privileged actions — approvals, deactivations, ID reviews, exports — will be recorded here."
      />
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">When (PH time)</th>
            <th className="px-3 py-2 font-medium">Who</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">What happened</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-muted/30">
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {stamp.format(new Date(row.createdAt))}
              </td>
              <td className="px-3 py-2">
                {row.actorName ?? (
                  <span className="text-muted-foreground">
                    {row.action === 'account.deleted'
                      ? 'The account owner'
                      : 'System'}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <Badge variant={tone(row.action)}>
                  {auditActionLabel(row.action)}
                </Badge>
              </td>
              <td className="px-3 py-2 text-foreground">{row.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
