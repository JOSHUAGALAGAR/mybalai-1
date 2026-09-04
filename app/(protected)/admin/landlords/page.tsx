import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader } from '@/components/dashboard/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { requireArea } from '@/lib/auth/dal'
import { listLandlordSubscriptions } from '@/services/subscriptions.service'
import * as adminRepo from '@/repositories/admin.repository'

export const metadata: Metadata = { title: 'Landlords' }

const TONE: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = { active: 'default', suspended: 'secondary', cancelled: 'destructive' }

export default async function AdminLandlordsPage() {
  await requireArea('superadmin')
  const [landlords, subs] = await Promise.all([
    adminRepo.listLandlordAccounts(),
    listLandlordSubscriptions(),
  ])
  const subByLandlord = new Map(subs.map((s) => [s.landlordId, s]))

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to admin
      </Link>
      <PageHeader
        title="Landlords"
        subtitle={`${landlords.length} ${
          landlords.length === 1 ? 'account' : 'accounts'
        }`}
        actions={
          <Button asChild size="sm">
            <Link href="/admin/landlords/new">New landlord</Link>
          </Button>
        }
      />

      {landlords.length === 0 ? (
        <EmptyState
          title="No landlord accounts"
          description="Create one — they get a sign-in and, once you assign a plan, can list properties."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Landlord</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Properties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {landlords.map((l) => {
                const sub = subByLandlord.get(l.legacyUserId)
                return (
                  <tr key={l.legacyUserId} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/landlords/${l.legacyUserId}`}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {l.fullName ?? `User #${l.legacyUserId}`}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {l.email}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {l.isActive ? (
                        <Badge variant="secondary">Enabled</Badge>
                      ) : (
                        <Badge variant="outline">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {sub ? (
                        <span className="flex items-center gap-1.5">
                          {sub.planName}
                          <Badge variant={TONE[sub.status] ?? 'outline'}>
                            {sub.status}
                          </Badge>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No plan
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {sub?.propertiesUsed ?? 0}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
