import { z } from 'zod'

import { blankToUndefined } from '@/schemas/_helpers'

export const BOOKING_PERIODS = ['daily', 'weekly', 'monthly'] as const
export type BookingPeriod = (typeof BOOKING_PERIODS)[number]

/**
 * Transitions a manager (or, for `cancelled`, the tenant) can request.
 * `confirmed` is intentionally absent — a booking only reaches it through a
 * verified payment (`settle_booking_payment`), never a manual action.
 */
export const BOOKING_TRANSITIONS = [
  'payment_pending',
  'rejected',
  'cancelled',
  'checked_in',
  'checked_out',
] as const
export type BookingTransition = (typeof BOOKING_TRANSITIONS)[number]

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Use the date picker.' })

export const createBookingSchema = z
  .object({
    room_id: z.coerce.number().int().positive({ error: 'Choose a room.' }),
    bed_id: z.coerce.number().int().positive({ error: 'Choose a bed.' }),
    period: z.enum(BOOKING_PERIODS, { error: 'Choose a rate period.' }),
    check_in: isoDate,
    check_out: isoDate,
    message: z.preprocess(
      blankToUndefined,
      z.string().trim().max(2000).optional(),
    ),
  })
  .refine((d) => new Date(d.check_out) > new Date(d.check_in), {
    error: 'Check-out must be after check-in.',
    path: ['check_out'],
  })

export type CreateBookingInput = z.infer<typeof createBookingSchema>

export const bookingActionSchema = z.object({
  to: z.enum(BOOKING_TRANSITIONS, { error: 'Unknown action.' }),
  response: z.preprocess(
    blankToUndefined,
    z.string().trim().max(2000).optional(),
  ),
})

export type BookingActionInput = z.infer<typeof bookingActionSchema>

/** nights between two ISO dates (check_out exclusive). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

/** Estimated total = unit price × billing units for the period. */
export function estimateTotal(
  period: BookingPeriod,
  unitPrice: number,
  nights: number,
): { units: number; total: number } {
  const units =
    period === 'daily'
      ? nights
      : period === 'weekly'
        ? Math.max(1, Math.ceil(nights / 7))
        : Math.max(1, Math.ceil(nights / 30))
  return { units, total: Math.round(unitPrice * units * 100) / 100 }
}

/** One month of rent, using the same billing rule as the booking itself (30 nights = 1 month). */
export function monthOfRent(period: BookingPeriod, unitPrice: number): number {
  return estimateTotal(period, unitPrice, 30).total
}

/**
 * Everything a tenant pays up front: the rent for the stay, plus — when the room requires them —
 * 1 month advance and a 1 month security deposit (each one month of rent). `total` is what is
 * saved as the booking amount and charged online.
 */
export function bookingCharges(input: {
  period: BookingPeriod
  unitPrice: number
  nights: number
  requireAdvance: boolean
  requireDeposit: boolean
}): {
  units: number
  rent: number
  advance: number
  deposit: number
  total: number
} {
  const { units, total: rent } = estimateTotal(
    input.period,
    input.unitPrice,
    input.nights,
  )
  const month = monthOfRent(input.period, input.unitPrice)
  const advance = input.requireAdvance ? month : 0
  const deposit = input.requireDeposit ? month : 0
  return {
    units,
    rent,
    advance,
    deposit,
    total: Math.round((rent + advance + deposit) * 100) / 100,
  }
}

/** "1 month advance + 1 month deposit", or null when the room asks for neither. */
export function advanceDepositLabel(
  requireAdvance: boolean,
  requireDeposit: boolean,
): string | null {
  const parts = [
    requireAdvance && '1 month advance',
    requireDeposit && '1 month deposit',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' + ') : null
}
