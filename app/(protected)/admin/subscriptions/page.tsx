import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader } from '@/components/dashboard/page-header'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { requireArea } from '@/lib/auth/dal'
import { listLandlordSubscriptions } from '@/services/subscriptions.service'

export const metadata: Metadata = { title: 'Subscriptions' }

const TONE: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = { active: 'default', suspended: 'secondary', cancelled: 'destructive' }

export default async function AdminSubscriptionsPage() {
  await requireArea('superadmin')
  const subs = await listLandlordSubscriptions()

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to admin
      </Link>
      <PageHeader
        title="Subscriptions"
        subtitle={`${subs.length} landlord ${
          subs.length === 1 ? 'subscription' : 'subscriptions'
        }`}
      />

      {subs.length === 0 ? (
        <EmptyState
          title="No subscriptions yet"
          description="Assign a plan from a landlord's page to get started."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Landlord</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Ends</th>
                <th className="px-3 py-2 font-medium">Properties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {subs.map((s) => (
                <tr key={s.subscriptionId} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/landlords/${s.landlordId}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {s.landlordName ?? `User #${s.landlordId}`}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {s.landlordEmail}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.planName}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={TONE[s.status] ?? 'outline'}>
                      {s.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.endsAt
                      ? new Date(s.endsAt).toLocaleDateString()
                      : 'Open-ended'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.propertiesUsed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
