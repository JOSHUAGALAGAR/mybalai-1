import type { Metadata } from 'next'

import { PageHeader } from '@/components/dashboard/page-header'
import { ManagedReviewList } from '@/components/rating/managed-review-list'
import { requireArea } from '@/lib/auth/dal'
import { listManagedReviews } from '@/services/ratings.service'

export const metadata: Metadata = { title: 'Reviews' }

export default async function LandlordReviewsPage() {
  await requireArea('landlord', 'superadmin')
  const items = await listManagedReviews()
  const pending = items.filter((r) => r.canRespond).length

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle={
          items.length === 0
            ? 'No reviews yet'
            : `${items.length} total · ${pending} awaiting a response`
        }
      />
      <ManagedReviewList items={items} />
    </div>
  )
}
