'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useActionState } from 'react'
import { Star } from 'lucide-react'

import {
  submitRatingAction,
  type ReviewActionState,
} from '@/app/(protected)/reviews/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export function RatingForm({
  propertyId,
  propertyName,
  existing,
}: {
  propertyId: number
  propertyName: string
  existing: { rating: number; review: string | null } | null
}) {
  const [state, action] = useActionState<ReviewActionState, FormData>(
    submitRatingAction,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [hover, setHover] = useState(0)

  return (
    <form action={action} className="max-w-xl space-y-5" noValidate>
      <input type="hidden" name="property_id" value={propertyId} />
      <input type="hidden" name="rating" value={rating} />
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <FormField
        label="Your rating"
        htmlFor="rating-stars"
        required
        error={errs.rating}
      >
        <div id="rating-stars" className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="rounded p-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Star
                className={cn(
                  'size-7',
                  n <= (hover || rating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-muted-foreground/40',
                )}
              />
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Review (optional)" htmlFor="review" error={errs.review}>
        <Textarea
          id="review"
          name="review"
          rows={5}
          maxLength={4000}
          defaultValue={existing?.review ?? ''}
          placeholder={`What was your stay at ${propertyName} like?`}
        />
      </FormField>

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Saving…">
          {existing ? 'Update review' : 'Submit review'}
        </SubmitButton>
        <Button asChild variant="outline">
          <Link href={`/discover/${propertyId}`}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
