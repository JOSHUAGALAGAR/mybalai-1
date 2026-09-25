import { describe, expect, it } from 'vitest'

import {
  advanceDepositLabel,
  bookingActionSchema,
  bookingCharges,
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

describe('bookingCharges', () => {
  const stay = { period: 'monthly' as const, unitPrice: 5000, nights: 30 }

  it('is only the rent when nothing is required', () => {
    expect(
      bookingCharges({ ...stay, requireAdvance: false, requireDeposit: false }),
    ).toEqual({ units: 1, rent: 5000, advance: 0, deposit: 0, total: 5000 })
  })

  it('adds one month of rent for each requirement', () => {
    const c = bookingCharges({
      ...stay,
      nights: 60,
      requireAdvance: true,
      requireDeposit: true,
    })
    expect(c).toMatchObject({
      rent: 10000,
      advance: 5000,
      deposit: 5000,
      total: 20000,
    })
  })

  it('treats a month as 30 nights for daily rates', () => {
    const c = bookingCharges({
      period: 'daily',
      unitPrice: 200,
      nights: 3,
      requireAdvance: true,
      requireDeposit: false,
    })
    expect(c).toMatchObject({
      rent: 600,
      advance: 6000,
      deposit: 0,
      total: 6600,
    })
  })

  it('total always equals rent + advance + deposit, to the centavo', () => {
    const c = bookingCharges({
      period: 'weekly',
      unitPrice: 333.33,
      nights: 10,
      requireAdvance: true,
      requireDeposit: true,
    })
    expect(c.total).toBeCloseTo(c.rent + c.advance + c.deposit, 2)
  })
})

describe('advanceDepositLabel', () => {
  it('describes what is required', () => {
    expect(advanceDepositLabel(false, false)).toBeNull()
    expect(advanceDepositLabel(true, false)).toBe('1 month advance')
    expect(advanceDepositLabel(false, true)).toBe('1 month deposit')
    expect(advanceDepositLabel(true, true)).toBe(
      '1 month advance + 1 month deposit',
    )
  })
})
