import type { Metadata } from 'next'

import { PageHeader } from '@/components/dashboard/page-header'
import { StatTile } from '@/components/dashboard/stat-tile'
import {
  EarningsList,
  PayoutHistory,
} from '@/components/landlord/earnings-list'
import { WithdrawCard } from '@/components/landlord/withdraw-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { requireArea } from '@/lib/auth/dal'
import { PAYOUT_SETUP_MESSAGE, isPayoutSetupProblem } from '@/lib/db-errors'
import { formatPct } from '@/lib/payouts/rules'
import { getMyEarnings, type MyEarnings } from '@/services/payouts.service'

export const metadata: Metadata = { title: 'Earnings' }
export const dynamic = 'force-dynamic'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

export default async function LandlordEarningsPage() {
  await requireArea('landlord', 'superadmin')
  let data: MyEarnings | null = null
  let needsSetup = false
  try {
    data = await getMyEarnings()
  } catch (error) {
    if (!isPayoutSetupProblem(error)) throw error
    needsSetup = true
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Earnings"
        subtitle="What you take home from online payments, after fees. Payments you verify yourself (like GCash receipts) go straight to you and are not listed here."
      />

      {needsSetup || !data ? (
        <Alert>
          <AlertDescription>{PAYOUT_SETUP_MESSAGE}</AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Ready to withdraw"
              value={peso.format(data.available)}
              footnote="Net, after fees"
            />
            <StatTile
              label="In hold"
              value={peso.format(data.onHold)}
              footnote={`Ready ${data.rules.holdDays} days after each payment`}
            />
            <StatTile
              label="Being withdrawn"
              value={peso.format(data.processing)}
              footnote="Requested, not yet sent"
            />
            <StatTile
              label="Withdrawn so far"
              value={peso.format(data.withdrawn)}
            />
          </section>

          <p className="rounded-2xl bg-primary-soft px-4 py-3 text-sm text-foreground">
            From every online payment,{' '}
            <strong>{formatPct(data.rules.paymongoFeePct)}%</strong> goes to
            PayMongo (payment processing) and{' '}
            <strong>{formatPct(data.rules.platformFeePct)}%</strong> to MyBalai.
            The rest is yours.
          </p>

          {data.clawback > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                {peso.format(data.clawback)} of money you already withdrew was
                refunded to a tenant. It will be taken off your next withdrawal.
              </AlertDescription>
            </Alert>
          )}

          <WithdrawCard data={data} />

          <section className="space-y-3" aria-label="Earnings">
            <h2 className="text-lg font-bold text-foreground">Your earnings</h2>
            <EarningsList earnings={data.earnings} />
          </section>

          <section className="space-y-3" aria-label="Withdrawals">
            <h2 className="text-lg font-bold text-foreground">Withdrawals</h2>
            <PayoutHistory payouts={data.payouts} />
          </section>
        </>
      )}
    </div>
  )
}
