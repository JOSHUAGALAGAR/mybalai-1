import { z } from 'zod'

import { blankToUndefined } from '@/schemas/_helpers'

export const RATING_MIN = 1
export const RATING_MAX = 5

/** Tenant creates or edits their one rating for a property. */
export const upsertRatingSchema = z.object({
  rating: z.coerce
    .number({ error: 'Pick a star rating.' })
    .int({ error: 'Pick a star rating.' })
    .min(RATING_MIN, { error: 'Pick a star rating.' })
    .max(RATING_MAX, { error: 'Pick a star rating.' }),
  review: z.preprocess(
    blankToUndefined,
    z.string().trim().max(4000).optional(),
  ),
})

export type UpsertRatingInput = z.infer<typeof upsertRatingSchema>

/** Landlord / superadmin posts one public reply to a review. */
export const respondReviewSchema = z.object({
  response: z
    .string()
    .trim()
    .min(1, { error: 'Write a response.' })
    .max(2000, { error: 'Keep it under 2000 characters.' }),
})

export type RespondReviewInput = z.infer<typeof respondReviewSchema>
