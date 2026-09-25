import { BarList } from '@/components/dashboard/bar-list'
import { ChartCard } from '@/components/dashboard/chart-card'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { Delta, StatTile } from '@/components/dashboard/stat-tile'
import type { LandlordDashboard } from '@/services/landlord-dashboard.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

export function LandlordInsights({ data }: { data: LandlordDashboard }) {
  const { revenue, occupancy, bookings, rating } = data
  const actions = bookings.awaitingReply + data.paymentsToVerify
  const statusMax = Math.max(1, ...bookings.byStatus.map((s) => s.count))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Revenue this month"
          value={peso.format(revenue.thisMonth)}
          footnote={<Delta pct={revenue.changePct} versus="last month" />}
          href="/landlord/payments?status=paid"
        />
        <StatTile
          label="Occupancy"
          value={
            occupancy.overall.pct === null
              ? '—'
              : `${occupancy.overall.pct.toFixed(0)}%`
          }
          footnote={`${occupancy.overall.occupied} of ${plural(occupancy.overall.bookable, 'bed')} occupied`}
          href="/landlord/properties"
        />
        <StatTile
          label="Needs your attention"
          value={String(actions)}
          footnote={`${plural(bookings.awaitingReply, 'booking')} to review · ${data.paymentsToVerify} to verify`}
          href={
            bookings.awaitingReply > 0 || data.paymentsToVerify === 0
              ? '/landlord/bookings?status=pending'
              : '/landlord/payments?status=pending'
          }
        />
        <StatTile
          label="Average rating"
          value={rating ? `${rating.average.toFixed(1)} / 5` : '—'}
          footnote={rating ? plural(rating.count, 'review') : 'No reviews yet'}
          href="/landlord/reviews"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Revenue"
          subtitle="Verified payments, last 6 months"
          className="lg:col-span-2"
        >
          <RevenueChart months={revenue.months} />
        </ChartCard>

        <ChartCard
          title="Bookings by status"
          subtitle={`${plural(bookings.total, 'booking')} across your properties`}
        >
          {bookings.byStatus.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No bookings yet.
            </p>
          ) : (
            <BarList
              ariaLabel="Bookings by status"
              max={statusMax}
              rows={bookings.byStatus.map((s) => ({
                key: s.code,
                label: s.label,
                value: s.count,
                display: String(s.count),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Occupancy by property"
          subtitle="Occupied beds out of beds available to let"
          className="lg:col-span-3"
        >
          {occupancy.byProperty.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Add a property to see occupancy.
            </p>
          ) : (
            <BarList
              ariaLabel="Occupancy by property"
              max={100}
              rows={occupancy.byProperty.map((p) => ({
                key: String(p.propertyId),
                label: p.name,
                value: p.pct ?? 0,
                display:
                  p.pct === null
                    ? 'No beds'
                    : `${p.pct.toFixed(0)}% · ${p.occupied}/${p.bookable}`,
                hint: `${p.occupied} occupied, ${p.reserved} reserved, ${p.bookable} bookable of ${p.total} beds`,
                href: `/landlord/properties/${p.propertyId}`,
              }))}
            />
          )}
        </ChartCard>
      </div>
    </div>
  )
}
