import type { Metadata } from 'next'

import { PageHeader } from '@/components/dashboard/page-header'
import { MyPlanView } from '@/components/subscription/my-plan-view'
import { PlanPicker } from '@/components/subscription/plan-picker'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { requireArea } from '@/lib/auth/dal'
import {
  getMyPlan,
  listPurchasablePlans,
} from '@/services/subscriptions.service'
import { isPaymongoConfigured } from '@/services/paymongo.service'

export const metadata: Metadata = { title: 'My plan' }

type SearchParams = Record<string, string | string[] | undefined>

export default async function MyPlanPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('landlord', 'superadmin')
  const subscribed = Boolean((await searchParams).subscribed)
  const [data, plans] = await Promise.all([
    getMyPlan(),
    isPaymongoConfigured() ? listPurchasablePlans() : Promise.resolve([]),
  ])

  return (
    <div className="space-y-8">
      <PageHeader
        title="My plan"
        subtitle="Your subscription and how much of it you're using."
      />
      {subscribed && (
        <Alert>
          <AlertDescription>
            Payment received. Your subscription activates as soon as it clears.
          </AlertDescription>
        </Alert>
      )}
      <MyPlanView data={data} />
      {isPaymongoConfigured() && <PlanPicker plans={plans} />}
    </div>
  )
}
