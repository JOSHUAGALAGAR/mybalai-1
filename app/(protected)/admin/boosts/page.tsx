import type { Metadata } from 'next'
import Link from 'next/link'

import { BoostCancel } from '@/components/admin/boost-cancel'
import { BoostPackageForm } from '@/components/admin/boost-package-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatTile } from '@/components/dashboard/stat-tile'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { requireArea } from '@/lib/auth/dal'
import {
  getBoostOverview,
  listPackagesForAdmin,
} from '@/services/boosts.service'

export const metadata: Metadata = { title: 'Boosts' }
export const dynamic = 'force-dynamic'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})
const day = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeZone: 'Asia/Manila',
})
const STATE = {
  live: 'Live',
  queued: 'Queued',
  ended: 'Ended',
  waiting_payment: 'Unpaid',
  cancelled: 'Cancelled',
} as const

const SETUP =
  'Boosts need a one-time database update. Run migration 0018_property_boosts.sql in the Supabase SQL editor, then reload.'

export default async function AdminBoostsPage() {
  await requireArea('superadmin')
  let data: {
    packages: Awaited<ReturnType<typeof listPackagesForAdmin>>
    overview: Awaited<ReturnType<typeof getBoostOverview>>
  } | null = null
  try {
    const [packages, overview] = await Promise.all([
      listPackagesForAdmin(),
      getBoostOverview(),
    ])
    data = { packages, overview }
  } catch (error) {
    const cause = (error as { cause?: { code?: string } })?.cause
    if (
      cause?.code === '42P01' ||
      cause?.code === 'PGRST205' ||
      cause?.code === '42703'
    )
      data = null
    else throw error
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to admin
        </Link>
        <PageHeader
          title="Boosts"
          subtitle="Landlords pay to have a property shown first in search. You set the packages and their prices."
        />
      </div>

      {!data ? (
        <Alert>
          <AlertDescription>{SETUP}</AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Boosted right now"
              value={String(data.overview.liveNow)}
            />
            <StatTile
              label="Boost revenue · this month"
              value={peso.format(data.overview.revenueThisMonth)}
            />
            <StatTile
              label="Boost revenue · all time"
              value={peso.format(data.overview.revenueTotal)}
            />
          </section>

          <section className="space-y-3" aria-label="Packages">
            <h2 className="text-lg font-bold text-foreground">
              Packages and prices
            </h2>
            <div className="space-y-3 rounded-2xl border border-border p-4">
              {data.packages.map((p) => (
                <BoostPackageForm key={p.packageId} pack={p} />
              ))}
              <div className="border-t border-border pt-3">
                <BoostPackageForm />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Prices apply to new purchases. The minimum is ₱20 (PayMongo’s
              minimum charge). MyBalai pays PayMongo’s fee on boosts.
            </p>
          </section>

          <section className="space-y-3" aria-label="Recent boosts">
            <h2 className="text-lg font-bold text-foreground">Recent boosts</h2>
            {data.overview.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No boosts bought yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Property</th>
                      <th className="px-3 py-2 font-medium">Landlord</th>
                      <th className="px-3 py-2 font-medium">Length</th>
                      <th className="px-3 py-2 text-right font-medium">Paid</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.overview.rows.map((r) => (
                      <tr key={r.boostId}>
                        <td className="px-3 py-2 font-medium">
                          {r.propertyName}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.landlordName}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.days} days
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {peso.format(r.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={
                              r.state === 'live' ? 'default' : 'secondary'
                            }
                          >
                            {STATE[r.state]}
                          </Badge>
                          {r.state === 'live' && r.endsAt && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              until {day.format(new Date(r.endsAt))}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {(r.state === 'live' ||
                            r.state === 'queued' ||
                            r.state === 'waiting_payment') && (
                            <BoostCancel boostId={r.boostId} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
