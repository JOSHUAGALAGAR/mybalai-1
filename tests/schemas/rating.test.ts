import { describe, expect, it } from 'vitest'

import { respondReviewSchema, upsertRatingSchema } from '@/schemas/rating'

describe('upsertRatingSchema', () => {
  it('coerces a 1-5 star string', () => {
    const r = upsertRatingSchema.safeParse({ rating: '4' })
    expect(r.success && r.data.rating).toBe(4)
  })

  it('rejects 0 and 6', () => {
    expect(upsertRatingSchema.safeParse({ rating: '0' }).success).toBe(false)
    expect(upsertRatingSchema.safeParse({ rating: 6 }).success).toBe(false)
  })

  it('treats a blank review as undefined', () => {
    const r = upsertRatingSchema.safeParse({ rating: 5, review: '   ' })
    expect(r.success && r.data.review).toBeUndefined()
  })
})

describe('respondReviewSchema', () => {
  it('requires a non-empty response', () => {
    expect(respondReviewSchema.safeParse({ response: 'Thanks!' }).success).toBe(
      true,
    )
    expect(respondReviewSchema.safeParse({ response: '   ' }).success).toBe(
      false,
    )
  })
})
