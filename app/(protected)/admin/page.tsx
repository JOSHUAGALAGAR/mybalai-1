import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CreditCard,
  FileBarChart,
  Megaphone,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react'

import { ModuleCard } from '@/components/dashboard/module-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { requireArea } from '@/lib/auth/dal'
import { getListingOverview } from '@/services/admin.service'
import { getSubscriptionOverview } from '@/services/subscriptions.service'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminOverviewPage() {
  await requireArea('superadmin')
  const [overview, subs] = await Promise.all([
    getListingOverview(),
    getSubscriptionOverview(),
  ])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform administration"
        subtitle="Review property listings from owners; users, subscriptions, and reports follow."
      />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Property listings
          </h2>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/properties">Review all</Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total"
            value={overview.total}
            href="/admin/properties"
          />
          {overview.byStatus
            .filter((s) => ['pending', 'active', 'inactive'].includes(s.code))
            .map((s) => (
              <StatTile
                key={s.code}
                label={s.name}
                value={s.count}
                href={`/admin/properties?status=${s.code}`}
                highlight={s.code === 'pending' && s.count > 0}
              />
            ))}
        </div>
        {overview.pending > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {overview.pending} listing{overview.pending === 1 ? '' : 's'}{' '}
            awaiting review.
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Landlords &amp; subscriptions
          </h2>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/landlords/new">New landlord</Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Landlords"
            value={subs.landlords}
            href="/admin/landlords"
          />
          <StatTile
            label="On an active plan"
            value={subs.withActiveSubscription}
            href="/admin/subscriptions"
          />
          <StatTile label="Plans" value={subs.plans} href="/admin/plans" />
          <StatTile
            label="Active plans"
            value={subs.activePlans}
            href="/admin/plans"
          />
        </div>
        {subs.landlords > subs.withActiveSubscription && (
          <p className="mt-2 text-sm text-muted-foreground">
            {subs.landlords - subs.withActiveSubscription} landlord
            {subs.landlords - subs.withActiveSubscription === 1 ? '' : 's'}{' '}
            without an active subscription — they cannot add listings.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">More</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ModuleCard
            title="Users"
            description="Every account, its roles, and activate / deactivate."
            icon={Users}
            href="/admin/users"
          />
          <ModuleCard
            title="Portal ads"
            description="Manage platform advertisements and target roles."
            icon={Megaphone}
            phase={11}
          />
          <ModuleCard
            title="Payments"
            description="Platform-wide payment oversight."
            icon={CreditCard}
            phase={11}
          />
          <ModuleCard
            title="Reports"
            description="Platform-wide operational and financial reports."
            icon={FileBarChart}
            phase={12}
          />
          <ModuleCard
            title="Audit logs"
            description="Review privileged and sensitive actions."
            icon={ScrollText}
            phase={12}
          />
          <ModuleCard
            title="Settings"
            description="Your administrator profile."
            icon={Settings}
            href="/settings"
          />
        </div>
      </section>
    </div>
  )
}

function StatTile({
  label,
  value,
  href,
  highlight,
}: {
  label: string
  value: number
  href: string
  highlight?: boolean
}) {
  return (
    <Link
      href={href}
      className={
        'rounded-lg border bg-card p-4 transition-colors hover:border-ring/60 hover:bg-muted/40 ' +
        (highlight ? 'border-primary' : 'border-border')
      }
    >
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground capitalize">{label}</p>
    </Link>
  )
}
