import { describe, expect, it } from 'vitest'

import {
  bookingActionSchema,
  createBookingSchema,
  estimateTotal,
  nightsBetween,
} from '@/schemas/booking'

describe('createBookingSchema', () => {
  const ok = {
    room_id: '10',
    bed_id: '3',
    period: 'monthly',
    check_in: '2026-04-01',
    check_out: '2026-05-01',
  }
  it('accepts a valid request', () => {
    expect(createBookingSchema.safeParse(ok).success).toBe(true)
  })
  it('rejects check-out on/before check-in', () => {
    expect(
      createBookingSchema.safeParse({ ...ok, check_out: '2026-04-01' }).success,
    ).toBe(false)
  })
  it('rejects a missing bed and a bad period', () => {
    expect(createBookingSchema.safeParse({ ...ok, bed_id: '0' }).success).toBe(
      false,
    )
    expect(
      createBookingSchema.safeParse({ ...ok, period: 'yearly' }).success,
    ).toBe(false)
  })
})

describe('bookingActionSchema', () => {
  it('accepts known transitions', () => {
    expect(
      bookingActionSchema.safeParse({ to: 'payment_pending' }).success,
    ).toBe(true)
    expect(bookingActionSchema.safeParse({ to: 'checked_out' }).success).toBe(
      true,
    )
  })
  it('rejects confirmed (payment-gated, never manual)', () => {
    expect(bookingActionSchema.safeParse({ to: 'confirmed' }).success).toBe(
      false,
    )
  })
  it('rejects unknown transitions', () => {
    expect(bookingActionSchema.safeParse({ to: 'pending' }).success).toBe(false)
  })
})

describe('nightsBetween / estimateTotal', () => {
  it('counts nights', () => {
    expect(nightsBetween('2026-04-01', '2026-04-08')).toBe(7)
  })
  it('bills daily per night', () => {
    expect(estimateTotal('daily', 500, 7)).toEqual({ units: 7, total: 3500 })
  })
  it('bills weekly by ceil(nights/7)', () => {
    expect(estimateTotal('weekly', 2000, 10)).toEqual({ units: 2, total: 4000 })
  })
  it('bills monthly by ceil(nights/30), min 1', () => {
    expect(estimateTotal('monthly', 8000, 30)).toEqual({
      units: 1,
      total: 8000,
    })
    expect(estimateTotal('monthly', 8000, 31)).toEqual({
      units: 2,
      total: 16000,
    })
  })
})
