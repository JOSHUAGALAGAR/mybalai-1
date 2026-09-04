import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SubscriptionForm } from '@/components/admin/subscription-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { getLandlordSubscription } from '@/services/subscriptions.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Landlord subscription' }

export default async function LandlordSubscriptionPage({
  params,
}: {
  params: Promise<{ landlordId: string }>
}) {
  await requireArea('superadmin')
  const landlordId = Number((await params).landlordId)
  if (!Number.isInteger(landlordId) || landlordId <= 0) notFound()

  let data
  try {
    data = await getLandlordSubscription(landlordId)
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'validation')
    ) {
      notFound()
    }
    throw error
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/landlords"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to landlords
      </Link>
      <PageHeader
        title={data.landlordName ?? `User #${data.landlordId}`}
        subtitle={data.landlordEmail ?? undefined}
      />

      <section className="max-w-lg">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Subscription
        </h2>
        <SubscriptionForm
          landlordId={data.landlordId}
          plans={data.plans.map((p) => ({ id: p.plan_id, name: p.name }))}
          current={{
            planId: data.subscription?.plan_id ?? null,
            status: data.subscription?.status ?? null,
            endsAt: data.subscription?.ends_at ?? null,
            note: data.subscription?.note ?? null,
          }}
        />
      </section>
    </div>
  )
}
