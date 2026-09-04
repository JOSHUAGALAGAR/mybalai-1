import Link from 'next/link'

import { StarRating } from '@/components/discovery/star-rating'
import { RespondReviewForm } from '@/components/rating/respond-review-form'
import type { ManagedReview } from '@/services/ratings.service'

export function ManagedReviewList({ items }: { items: ManagedReview[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No reviews for your properties yet.
      </p>
    )
  }

  return (
    <ul className="space-y-4">
      {items.map((r) => (
        <li
          key={r.ratingId}
          className="rounded-lg border border-border bg-card p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <StarRating value={r.rating} />
              <span className="text-sm font-medium text-foreground">
                {r.reviewerName}
              </span>
            </div>
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
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(r.createdAt).toLocaleDateString()}
          </p>

          {r.landlordResponse ? (
            <div className="mt-3 border-l-2 border-border pl-3">
              <p className="text-xs font-medium text-muted-foreground">
                Your response
              </p>
              <p className="text-sm whitespace-pre-wrap text-foreground">
                {r.landlordResponse}
              </p>
            </div>
          ) : (
            <RespondReviewForm ratingId={r.ratingId} />
          )}
        </li>
      ))}
    </ul>
  )
}
