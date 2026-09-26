import type { Metadata } from 'next'
import Link from 'next/link'
import { Download } from 'lucide-react'

import { BarList } from '@/components/dashboard/bar-list'
import { ChartCard } from '@/components/dashboard/chart-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { Delta, StatTile } from '@/components/dashboard/stat-tile'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { requireArea } from '@/lib/auth/dal'
import { getPlatformReport } from '@/services/reports.service'

export const metadata: Metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})
const num = new Intl.NumberFormat('en-PH')

const EXPORTS = [
  {
    kind: 'payments',
    label: 'Payments',
    hint: 'Every payment, with payer, status and method.',
  },
  {
    kind: 'bookings',
    label: 'Bookings',
    hint: 'Every booking with tenant, dates and total.',
  },
  {
    kind: 'boosts',
    label: 'Boost purchases',
    hint: 'What landlords paid to boost properties.',
  },
  {
    kind: 'users',
    label: 'Users',
    hint: 'Accounts, roles and verification state.',
  },
] as const

export default async function AdminReportsPage() {
  await requireArea('superadmin')
  const r = await getPlatformReport()
  const maxNew = Math.max(1, ...r.users.newByMonth.map((m) => m.count))
  const maxCreated = Math.max(
    1,
    ...r.bookings.createdByMonth.map((m) => m.count),
  )
  const maxBookingStatus = Math.max(
    1,
    ...r.bookings.byStatus.map((s) => s.count),
  )
  const maxListing = Math.max(1, ...r.listings.byStatus.map((s) => s.count))
  const maxRole = Math.max(1, ...r.users.byRole.map((s) => s.count))

  return (
    <div className="space-y-8">
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to admin
      </Link>
      <PageHeader
        title="Reports"
        subtitle="How the platform is doing: money in, bookings, listings and people. Amounts count verified payments only."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Booking revenue · this month"
          value={peso.format(r.revenue.bookingThisMonth)}
          footnote={
            <Delta pct={r.revenue.bookingChangePct} versus="last month" />
          }
        />
        <StatTile
          label="MyBalai revenue · this month"
          value={peso.format(r.revenue.mybalaiThisMonth)}
          footnote={
            <Delta pct={r.revenue.mybalaiChangePct} versus="last month" />
          }
        />
        <StatTile
          label="Bookings"
          value={num.format(r.bookings.total)}
          footnote={`${num.format(r.bookings.createdByMonth.at(-1)?.count ?? 0)} this month`}
          href="/admin/bookings"
        />
        <StatTile
          label="Listings"
          value={num.format(r.listings.total)}
          footnote={`${num.format(r.listings.byStatus.find((s) => s.code === 'active')?.count ?? 0)} active`}
          href="/admin/properties"
        />
        <StatTile
          label="Accounts"
          value={num.format(r.users.total)}
          footnote={`${num.format(r.users.active)} active · ${num.format(r.users.idVerified)} ID verified`}
          href="/admin/users"
        />
        <StatTile
          label="ID reviews waiting"
          value={num.format(r.pending.idVerifications)}
          href="/admin/verifications"
        />
        <StatTile
          label="Payments to verify"
          value={num.format(r.pending.payments)}
          href="/admin/payments?status=pending"
        />
        <StatTile
          label="Refunded · 6 months"
          value={peso.format(r.revenue.refundedTotal)}
          footnote="Given back to tenants"
        />
        <StatTile
          label="6-month revenue"
          value={peso.format(r.revenue.bookingTotal + r.revenue.mybalaiTotal)}
          footnote={`${peso.format(r.revenue.bookingTotal)} bookings · ${peso.format(r.revenue.mybalaiTotal)} MyBalai`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Booking revenue"
          subtitle="Verified tenant payments, last 6 months"
        >
          <RevenueChart months={r.revenue.bookingMonths} />
        </ChartCard>
        <ChartCard
          title="MyBalai revenue"
          subtitle="Transaction fees + boosts, last 6 months"
        >
          <RevenueChart months={r.revenue.mybalaiMonths} />
        </ChartCard>
        <ChartCard title="New bookings" subtitle="Requests created per month">
          <BarList
            ariaLabel="New bookings per month"
            max={maxCreated}
            rows={r.bookings.createdByMonth.map((m) => ({
              key: m.key,
              label: `${m.label} ${m.year}`,
              value: m.count,
              display: num.format(m.count),
            }))}
          />
        </ChartCard>
        <ChartCard title="New accounts" subtitle="Sign-ups per month">
          <BarList
            ariaLabel="New accounts per month"
            max={maxNew}
            rows={r.users.newByMonth.map((m) => ({
              key: m.key,
              label: `${m.label} ${m.year}`,
              value: m.count,
              display: num.format(m.count),
            }))}
          />
        </ChartCard>
        <ChartCard title="Bookings by status" subtitle="All time">
          <BarList
            ariaLabel="Bookings by status"
            max={maxBookingStatus}
            rows={r.bookings.byStatus.map((s) => ({
              key: s.code,
              label: s.label,
              value: s.count,
              display: num.format(s.count),
              href: `/admin/bookings?status=${s.code}`,
            }))}
          />
        </ChartCard>
        <ChartCard title="Listings by status">
          <BarList
            ariaLabel="Listings by status"
            max={maxListing}
            rows={r.listings.byStatus.map((s) => ({
              key: s.code,
              label: s.label,
              value: s.count,
              display: num.format(s.count),
              href: `/admin/properties?status=${s.code}`,
            }))}
          />
        </ChartCard>
        <ChartCard title="Accounts by role">
          <BarList
            ariaLabel="Accounts by role"
            max={maxRole}
            rows={r.users.byRole.map((s) => ({
              key: s.role,
              label: s.role,
              value: s.count,
              display: num.format(s.count),
            }))}
          />
        </ChartCard>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Export to CSV</CardTitle>
            <p className="text-xs text-muted-foreground">
              Opens in Excel or Google Sheets. Leave the dates empty for
              everything. Each export is written to the audit log.
            </p>
          </CardHeader>
          <CardContent>
            <form
              method="get"
              action="/admin/reports/export"
              className="space-y-4"
            >
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                    From
                  </span>
                  <Input type="date" name="from" className="w-44" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                    To
                  </span>
                  <Input type="date" name="to" className="w-44" />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {EXPORTS.map((e) => (
                  <Button
                    key={e.kind}
                    type="submit"
                    name="kind"
                    value={e.kind}
                    variant="outline"
                    className="h-auto justify-start gap-2 py-3 text-left whitespace-normal"
                  >
                    <Download className="size-4 shrink-0" aria-hidden />
                    <span>
                      <span className="block font-semibold">{e.label}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {e.hint}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
