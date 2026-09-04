import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader } from '@/components/dashboard/page-header'
import { StarRating } from '@/components/discovery/star-rating'
import { EmptyState } from '@/components/ui/empty-state'
import { requireArea } from '@/lib/auth/dal'
import { listMyRatings } from '@/services/ratings.service'

export const metadata: Metadata = { title: 'Reviews' }

export default async function MyReviewsPage() {
  await requireArea('tenant', 'superadmin')
  const items = await listMyRatings()

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle={`${items.length} ${items.length === 1 ? 'review' : 'reviews'}`}
      />

      {items.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          description="After a stay, you can rate the property from its page or your booking."
        />
      ) : (
        <ul className="space-y-4">
          {items.map((r) => (
            <li
              key={r.ratingId}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StarRating value={r.rating} />
                <Link
                  href={`/discover/${r.propertyId}`}
                  className="text-xs text-muted-foreground underline"
                >
                  {r.propertyName ?? `Property #${r.propertyId}`}
                </Link>
              </div>
              {r.review && (
                <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
                  {r.review}
                </p>
              )}
              {r.landlordResponse && (
                <div className="mt-3 border-l-2 border-border pl-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Landlord response
                  </p>
                  <p className="text-sm whitespace-pre-wrap text-foreground">
                    {r.landlordResponse}
                  </p>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Updated {new Date(r.updatedAt).toLocaleDateString()} ·{' '}
                <Link
                  href={`/discover/${r.propertyId}/review`}
                  className="underline"
                >
                  edit
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
