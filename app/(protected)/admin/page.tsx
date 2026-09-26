import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Banknote,
  CalendarRange,
  CreditCard,
  FileBarChart,
  Megaphone,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react'

import { BarList } from '@/components/dashboard/bar-list'
import { ChartCard } from '@/components/dashboard/chart-card'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { Delta } from '@/components/dashboard/stat-tile'
import { ModuleCard } from '@/components/dashboard/module-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { requireArea } from '@/lib/auth/dal'
import { getListingOverview } from '@/services/admin.service'
import { countPendingVerifications } from '@/services/verification.service'
import { auditActionLabel } from '@/lib/audit/actions'
import { recentActivity } from '@/services/audit.service'
import {
  getPlatformReport,
  type PlatformReport,
} from '@/services/reports.service'
import { countPendingApplications } from '@/services/applications.service'
import { getBoostOverview } from '@/services/boosts.service'
import { getDownloadStats } from '@/services/downloads.service'
import { listLandlordsForAdmin } from '@/services/admin.service'

export const metadata: Metadata = { title: 'Admin' }

// The charts are a convenience layer: if they fail to load, the rest of the overview must still render.
async function loadReport(): Promise<PlatformReport | null> {
  try {
    return await getPlatformReport()
  } catch (error) {
    console.error('[admin] overview charts failed to load', error)
    return null
  }
}

// Just hides (with a hint) until migration 0025 has been run.
async function loadDownloads() {
  try {
    return await getDownloadStats()
  } catch (error) {
    console.error('[admin] app downloads failed to load', error)
    return null
  }
}

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

/** Landlord and boost counts for the overview; the section just hides if boosts are not set up yet. */
async function loadLandlordSummary() {
  const landlords = await listLandlordsForAdmin()
  const boosts = await getBoostOverview().catch(() => null)
  const applications = await countPendingApplications()
  return {
    landlords: landlords.length,
    boostedNow: boosts?.liveNow ?? 0,
    applications,
  }
}

export default async function AdminOverviewPage() {
  await requireArea('superadmin')
  const [overview, subs, pendingIds, activity, report, downloads] = await Promise.all([
    getListingOverview(),
    loadLandlordSummary(),
    countPendingVerifications(),
    recentActivity(6),
    loadReport(),
    loadDownloads(),
  ])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform administration"
        subtitle="Review listings, manage people and plans, oversee bookings and payments, and keep an eye on the platform."
      />

      {report && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Platform trends
            </h2>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/reports">Full reports</Link>
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Booking revenue"
              subtitle={`${peso.format(report.revenue.bookingThisMonth)} this month`}
            >
              <RevenueChart months={report.revenue.bookingMonths} />
              <p className="mt-2 text-xs text-muted-foreground">
                <Delta
                  pct={report.revenue.bookingChangePct}
                  versus="last month"
                />
              </p>
            </ChartCard>
            <ChartCard
              title="MyBalai revenue"
              subtitle={`${peso.format(report.revenue.mybalaiThisMonth)} this month`}
            >
              <RevenueChart months={report.revenue.mybalaiMonths} />
              <p className="mt-2 text-xs text-muted-foreground">
                <Delta
                  pct={report.revenue.mybalaiChangePct}
                  versus="last month"
                />
              </p>
            </ChartCard>
            <ChartCard
              title="Bookings by status"
              subtitle={`${report.bookings.total} in total`}
            >
              {report.bookings.byStatus.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No bookings yet.
                </p>
              ) : (
                <BarList
                  ariaLabel="Bookings by status"
                  max={Math.max(
                    ...report.bookings.byStatus.map((s) => s.count),
                  )}
                  rows={report.bookings.byStatus.map((s) => ({
                    key: s.code,
                    label: s.label,
                    value: s.count,
                    display: String(s.count),
                    href: `/admin/bookings?status=${s.code}`,
                  }))}
                />
              )}
            </ChartCard>
            <ChartCard
              title="New accounts"
              subtitle={`${report.users.total} accounts, ${report.users.idVerified} ID verified`}
            >
              <BarList
                ariaLabel="New accounts per month"
                max={Math.max(
                  1,
                  ...report.users.newByMonth.map((m) => m.count),
                )}
                rows={report.users.newByMonth.map((m) => ({
                  key: m.key,
                  label: `${m.label} ${m.year}`,
                  value: m.count,
                  display: String(m.count),
                }))}
              />
            </ChartCard>
          </div>
        </section>
      )}

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
          <h2 className="text-sm font-semibold text-foreground">Landlords</h2>
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
            label="Applications waiting"
            value={subs.applications}
            href="/admin/applications"
            highlight={subs.applications > 0}
          />
          <StatTile
            label="Boosted right now"
            value={subs.boostedNow}
            href="/admin/boosts"
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Tenant ID verification
          </h2>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/verifications">Review</Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Waiting for review"
            value={pendingIds}
            href="/admin/verifications"
            highlight={pendingIds > 0}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Android app downloads
        </h2>
        {downloads ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="All time" value={downloads.total} />
            <StatTile label="Last 30 days" value={downloads.last30Days} />
            <StatTile label="Last 7 days" value={downloads.last7Days} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not tracking yet. Run <code>0025_app_downloads.sql</code> in the
            Supabase SQL editor to start counting downloads from the landing
            page.
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Recent activity
          </h2>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/audit-logs">Full log</Link>
          </Button>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing recorded yet. Approvals, deactivations, ID reviews and
            exports will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {activity.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm"
              >
                <span className="min-w-0 text-foreground">
                  <span className="font-medium">
                    {auditActionLabel(row.action)}
                  </span>{' '}
                  <span className="text-muted-foreground">— {row.summary}</span>
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {row.actorName ?? 'System'} ·{' '}
                  {new Date(row.createdAt).toLocaleString('en-PH', {
                    timeZone: 'Asia/Manila',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </li>
            ))}
          </ul>
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
            description="Banners for tenants, landlords and caretakers."
            icon={Megaphone}
            href="/admin/ads"
          />
          <ModuleCard
            title="Bookings"
            description="Every booking on the platform, with status filters."
            icon={CalendarRange}
            href="/admin/bookings"
          />
          <ModuleCard
            title="Payments"
            description="Platform-wide payment oversight."
            icon={CreditCard}
            href="/admin/payments"
          />
          <ModuleCard
            title="Payouts & fees"
            description="Set the withdrawal day, the minimum, and the fees; pay landlord requests."
            icon={Banknote}
            href="/admin/payouts"
          />
          <ModuleCard
            title="Reports"
            description="Revenue, bookings, listings and sign-ups, plus CSV exports."
            icon={FileBarChart}
            href="/admin/reports"
          />
          <ModuleCard
            title="Audit logs"
            description="Who did what, and when — permanent and read-only."
            icon={ScrollText}
            href="/admin/audit-logs"
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
  href?: string
  highlight?: boolean
}) {
  const className =
    'rounded-lg border bg-card p-4 ' +
    (highlight ? 'border-primary' : 'border-border')
  const body = (
    <>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground capitalize">{label}</p>
    </>
  )
  if (!href) return <div className={className}>{body}</div>
  return (
    <Link
      href={href}
      className={
        className + ' transition-colors hover:border-ring/60 hover:bg-muted/40'
      }
    >
      {body}
    </Link>
  )
}
