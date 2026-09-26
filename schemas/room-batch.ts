import { z } from 'zod'

import {
  blankToUndefined,
  optionalFlag,
  optionalNumber,
  optionalText,
} from '@/schemas/_helpers'
import { RATE_PERIODS } from '@/schemas/rental-rate'

/**
 * The JSON a landlord builds up in the "Add rooms" / "Add rental rates" windows before anything
 * touches the database. One file = one request, no matter how many rooms or rates it holds.
 * The same schemas run in the browser (to catch mistakes early) and on the server (the authority).
 */

export const MAX_BATCH_ROOMS = 30
export const MAX_BEDS_PER_DRAFT_ROOM = 20
export const MAX_RATES_PER_DRAFT_ROOM = 6
export const MAX_BATCH_RATES = 60

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Use a date like 2026-10-01.' })

const priceField = z.coerce
  .number({ error: 'Enter a price.' })
  .min(0, { error: 'Price cannot be negative.' })
  .max(100_000_000, { error: 'Price is too high.' })

const rateShape = {
  period: z.enum([...RATE_PERIODS], {
    error: 'Choose daily, weekly or monthly.',
  }),
  price: priceField,
  valid_from: isoDate,
  valid_until: z.preprocess(blankToUndefined, isoDate.optional()),
}

const untilNotBeforeFrom = {
  error: 'The end date must be on or after the start date.',
  path: ['valid_until'],
}
const untilOk = (d: { valid_from: string; valid_until?: string }) =>
  !d.valid_until || d.valid_until >= d.valid_from

/** A rate inside a draft room (the room is implied). */
export const rateDraftSchema = z
  .object(rateShape)
  .refine(untilOk, untilNotBeforeFrom)
export type RateDraft = z.infer<typeof rateDraftSchema>

/** A rate for a room that already exists. */
export const roomRateDraftSchema = z
  .object({
    room_id: z.coerce
      .number({ error: 'Choose a room.' })
      .int()
      .positive({ error: 'Choose a room.' }),
    ...rateShape,
  })
  .refine(untilOk, untilNotBeforeFrom)
export type RoomRateDraft = z.infer<typeof roomRateDraftSchema>

export const roomDraftSchema = z.object({
  room_number: optionalText(40),
  room_name: optionalText(120),
  room_type_id: optionalNumber({
    int: true,
    min: 1,
    message: 'Choose a valid room type.',
  }),
  floor: optionalText(40),
  area_sqm: optionalNumber({
    min: 0,
    max: 100000,
    message: 'Area must be 0 or more.',
  }),
  max_occupants: z.coerce
    .number({ error: 'Max occupants must be a whole number.' })
    .int({ error: 'Max occupants must be a whole number.' })
    .min(1, { error: 'Max occupants must be at least 1.' })
    .max(50, { error: 'Max occupants is too high.' })
    .default(1),
  description: optionalText(4000),
  require_advance: optionalFlag,
  require_deposit: optionalFlag,
  /** Beds to create in the room, numbered 1..n. */
  beds: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: 'Beds must be a whole number.' })
      .int({ error: 'Beds must be a whole number.' })
      .min(0, { error: 'Beds cannot be negative.' })
      .max(MAX_BEDS_PER_DRAFT_ROOM, {
        error: `At most ${MAX_BEDS_PER_DRAFT_ROOM} beds at once.`,
      })
      .default(0),
  ),
  rates: z
    .array(rateDraftSchema)
    .max(MAX_RATES_PER_DRAFT_ROOM, {
      error: `At most ${MAX_RATES_PER_DRAFT_ROOM} rates per room.`,
    })
    .default([]),
})
export type RoomDraft = z.infer<typeof roomDraftSchema>

export const roomBatchSchema = z.object({
  version: z.literal(1).optional(),
  rooms: z
    .array(roomDraftSchema)
    .min(1, { error: 'Add at least one room.' })
    .max(MAX_BATCH_ROOMS, {
      error: `At most ${MAX_BATCH_ROOMS} rooms at once.`,
    }),
})

export const rateBatchSchema = z.object({
  version: z.literal(1).optional(),
  rates: z
    .array(roomRateDraftSchema)
    .min(1, { error: 'Add at least one rate.' })
    .max(MAX_BATCH_RATES, {
      error: `At most ${MAX_BATCH_RATES} rates at once.`,
    }),
})

/** "Room 3: Max occupants must be at least 1." — the first problem, in words a landlord can act on. */
export function firstBatchProblem(
  error: z.ZodError,
  noun: 'Room' | 'Rate',
): string {
  const issue = error.issues[0]
  const path = issue.path
  const index = path[1] // ["rooms", 2, "max_occupants", ...]
  const where = typeof index === 'number' ? `${noun} ${index + 1}: ` : ''
  return `${where}${issue.message}`
}
