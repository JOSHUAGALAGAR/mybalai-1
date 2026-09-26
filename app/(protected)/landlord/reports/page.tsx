import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import Link from 'next/link'

import { BarList } from '@/components/dashboard/bar-list'
import { ChartCard } from '@/components/dashboard/chart-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { Delta, StatTile } from '@/components/dashboard/stat-tile'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { requireArea } from '@/lib/auth/dal'
import { cn } from '@/lib/utils'
import {
  getLandlordReport,
  parseRange,
  REPORT_RANGES,
} from '@/services/landlord-reports.service'

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
    hint: 'Every payment with payer and status.',
  },
  { kind: 'bookings', label: 'Bookings', hint: 'Tenants, dates and totals.' },
  {
    kind: 'tenants',
    label: 'Tenants',
    hint: 'Who is staying where, with contacts.',
  },
] as const

export default async function LandlordReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireArea('landlord', 'superadmin')
  const range = parseRange((await searchParams).range)
  const r = await getLandlordReport(range)
  const maxProperty = Math.max(1, ...r.revenue.byProperty.map((p) => p.amount))
  const maxCreated = Math.max(
    1,
    ...r.bookings.createdByMonth.map((m) => m.count),
  )
  const maxBooking = Math.max(1, ...r.bookings.byStatus.map((s) => s.count))
  const maxPayment = Math.max(1, ...r.payments.byStatus.map((s) => s.count))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        subtitle="Money in, bookings and occupancy across your properties. Revenue counts payments you have verified."
        actions={
          <nav
            aria-label="Period"
            className="flex gap-1 rounded-full border border-border p-1 text-sm"
          >
            {REPORT_RANGES.map((n) => (
              <Link
                key={n}
                href={`/landlord/reports?range=${n}`}
                aria-current={n === range ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3 py-1 font-medium',
                  n === range
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {n} months
              </Link>
            ))}
          </nav>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`Revenue · ${range} months`}
          value={peso.format(r.revenue.total)}
          footnote={`${peso.format(r.revenue.thisMonth)} this month`}
        />
        <StatTile
          label="This month vs last"
          value={peso.format(r.revenue.thisMonth)}
          footnote={<Delta pct={r.revenue.changePct} versus="last month" />}
        />
        <StatTile
          label="Waiting to be verified"
          value={peso.format(r.revenue.pendingAmount)}
          href="/landlord/payments?status=pending"
        />
        <StatTile
          label="Average booking"
          value={
            r.bookings.averageValue === null
              ? '—'
              : peso.format(r.bookings.averageValue)
          }
          footnote="Confirmed stays in this period"
        />
        <StatTile
          label="Bookings in period"
          value={num.format(r.bookings.inRange)}
          footnote={`${num.format(r.bookings.total)} all time`}
          href="/landlord/bookings"
        />
        <StatTile
          label="Occupancy"
          value={
            r.occupancy.overall.pct === null
              ? '—'
              : `${r.occupancy.overall.pct.toFixed(0)}%`
          }
          footnote={`${r.occupancy.overall.occupied} of ${r.occupancy.overall.bookable} beds`}
        />
        <StatTile
          label="Average rating"
          value={r.rating ? `${r.rating.average.toFixed(1)} / 5` : '—'}
          footnote={r.rating ? `${r.rating.count} reviews` : 'No reviews yet'}
          href="/landlord/reviews"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Revenue by month"
          subtitle={`Verified payments, last ${range} months`}
        >
          <RevenueChart months={r.revenue.months} />
        </ChartCard>
        <ChartCard
          title="Revenue by property"
          subtitle={`Last ${range} months`}
        >
          {r.revenue.byProperty.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No verified payments in this period yet.
            </p>
          ) : (
            <BarList
              ariaLabel="Revenue by property"
              max={maxProperty}
              rows={r.revenue.byProperty.map((p) => ({
                key: p.name,
                label: p.name,
                value: p.amount,
                display: peso.format(p.amount),
                hint: `${p.payments} verified payment${p.payments === 1 ? '' : 's'}`,
              }))}
            />
          )}
        </ChartCard>
        <ChartCard title="New booking requests" subtitle="Per month">
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
        <ChartCard
          title="Occupancy by property"
          subtitle="Occupied beds out of beds available to let"
        >
          {r.occupancy.byProperty.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Add a property to see occupancy.
            </p>
          ) : (
            <BarList
              ariaLabel="Occupancy by property"
              max={100}
              rows={r.occupancy.byProperty.map((p) => ({
                key: String(p.propertyId),
                label: p.name,
                value: p.pct ?? 0,
                display:
                  p.pct === null
                    ? 'No beds'
                    : `${p.pct.toFixed(0)}% · ${p.occupied}/${p.bookable}`,
                href: `/landlord/properties/${p.propertyId}`,
              }))}
            />
          )}
        </ChartCard>
        <ChartCard title="Bookings by status" subtitle="All time">
          {r.bookings.byStatus.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No bookings yet.
            </p>
          ) : (
            <BarList
              ariaLabel="Bookings by status"
              max={maxBooking}
              rows={r.bookings.byStatus.map((s) => ({
                key: s.code,
                label: s.label,
                value: s.count,
                display: num.format(s.count),
                href: `/landlord/bookings?status=${s.code}`,
              }))}
            />
          )}
        </ChartCard>
        <ChartCard title="Payments by status" subtitle="All time">
          {r.payments.byStatus.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No payments yet.
            </p>
          ) : (
            <BarList
              ariaLabel="Payments by status"
              max={maxPayment}
              rows={r.payments.byStatus.map((s) => ({
                key: s.code,
                label: s.label,
                value: s.count,
                display: num.format(s.count),
                href: `/landlord/payments?status=${s.code}`,
              }))}
            />
          )}
        </ChartCard>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Export to CSV</CardTitle>
            <p className="text-xs text-muted-foreground">
              Opens in Excel or Google Sheets. Leave the dates empty for
              everything (tenants ignores dates).
            </p>
          </CardHeader>
          <CardContent>
            <form
              method="get"
              action="/landlord/reports/export"
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
              <div className="grid gap-2 sm:grid-cols-3">
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
