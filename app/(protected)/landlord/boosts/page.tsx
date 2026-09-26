import type { Metadata } from 'next'
import { Rocket } from 'lucide-react'

import { BoostPicker } from '@/components/boost/boost-picker'
import { PageHeader } from '@/components/dashboard/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { requireArea } from '@/lib/auth/dal'
import { isPaymongoConfigured } from '@/lib/env.server'
import { getMyBoosts, type MyBoosts } from '@/services/boosts.service'

export const metadata: Metadata = { title: 'Boost' }
export const dynamic = 'force-dynamic'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})
const day = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeZone: 'Asia/Manila',
})

const STATE = {
  live: { label: 'Boosted now', variant: 'default' },
  queued: { label: 'Starts soon', variant: 'secondary' },
  ended: { label: 'Ended', variant: 'outline' },
  waiting_payment: { label: 'Waiting for payment', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
} as const

const SETUP =
  'Boosts need a one-time database update. Run migration 0018_property_boosts.sql in the Supabase SQL editor, then reload.'

export default async function LandlordBoostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireArea('landlord', 'superadmin')
  const justPaid = (await searchParams).paid === '1'

  let data: MyBoosts | null = null
  let needsSetup = false
  try {
    data = await getMyBoosts()
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } })
      ?.cause
    if (
      cause?.code === '42P01' ||
      cause?.code === 'PGRST205' ||
      cause?.code === '42703'
    )
      needsSetup = true
    else throw error
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Boost your property"
        subtitle="Listing is free. Want more tenants to see a property? Boost it and it is shown first in search, with a “Boosted” badge, for the days you choose."
      />

      {needsSetup || !data ? (
        <Alert>
          <AlertDescription>{SETUP}</AlertDescription>
        </Alert>
      ) : (
        <>
          {justPaid && (
            <Alert>
              <Rocket className="size-4" aria-hidden />
              <AlertDescription>
                Thanks! Once PayMongo confirms your payment the boost starts
                automatically. Refresh this page in a moment if it still says
                “Waiting for payment”.
              </AlertDescription>
            </Alert>
          )}
          <BoostPicker data={data} paymentsAvailable={isPaymongoConfigured()} />

          <section className="space-y-3" aria-label="Your boosts">
            <h2 className="text-lg font-bold text-foreground">Your boosts</h2>
            {data.boosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You haven’t boosted anything yet.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border">
                {data.boosts.map((b) => (
                  <li
                    key={b.boostId}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {b.propertyName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.days} days · {peso.format(b.amount)}
                        {b.state === 'live' &&
                          b.endsAt &&
                          ` · until ${day.format(new Date(b.endsAt))} (${b.daysLeft} left)`}
                        {b.state === 'queued' &&
                          b.startsAt &&
                          ` · starts ${day.format(new Date(b.startsAt))}`}
                      </p>
                    </div>
                    <Badge variant={STATE[b.state].variant}>
                      {STATE[b.state].label}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
