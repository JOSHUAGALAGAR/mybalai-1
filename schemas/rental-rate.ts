import { z } from 'zod'

import { blankToUndefined } from '@/schemas/_helpers'

export const RATE_PERIODS = ['daily', 'weekly', 'monthly'] as const
export type RatePeriod = (typeof RATE_PERIODS)[number]

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Use the date picker (YYYY-MM-DD).' })

export const rentalRateFormSchema = z
  .object({
    room_id: z.coerce
      .number({ error: 'Select a room.' })
      .int()
      .positive({ error: 'Select a room.' }),
    period: z.enum([...RATE_PERIODS], { error: 'Select a rate period.' }),
    price: z.coerce
      .number({ error: 'Enter a price.' })
      .min(0, { error: 'Price cannot be negative.' })
      .max(100_000_000, { error: 'Price is too high.' }),
    valid_from: isoDate,
    valid_until: z.preprocess(blankToUndefined, isoDate.optional()),
  })
  .refine(
    (data) =>
      !data.valid_until ||
      new Date(data.valid_until) >= new Date(data.valid_from),
    {
      error: 'End date must be on or after the start date.',
      path: ['valid_until'],
    },
  )

export type RentalRateFormInput = z.infer<typeof rentalRateFormSchema>
