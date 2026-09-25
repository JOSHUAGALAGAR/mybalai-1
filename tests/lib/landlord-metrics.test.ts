import { describe, expect, it } from 'vitest'

import {
  averageRating,
  bookingStatusCounts,
  niceScale,
  occupancyByProperty,
  overallOccupancy,
  percentChange,
  revenueByMonth,
} from '@/lib/dashboard/landlord-metrics'

const paid = (amount: number, paidAt: string) => ({
  amount,
  statusCode: 'paid',
  paidAt,
  submittedAt: paidAt,
})

describe('revenueByMonth', () => {
  const now = new Date('2026-09-25T04:00:00Z')

  it('returns the last N months oldest-first, crossing a year boundary', () => {
    const months = revenueByMonth([], new Date('2026-02-10T00:00:00Z'), 4)
    expect(months.map((m) => m.key)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  it('sums only paid payments into their month', () => {
    const months = revenueByMonth(
      [
        paid(1000, '2026-09-02T10:00:00Z'),
        paid(500, '2026-09-20T10:00:00Z'),
        paid(700, '2026-08-15T10:00:00Z'),
        { ...paid(9999, '2026-09-03T10:00:00Z'), statusCode: 'pending' },
        paid(123, '2025-01-01T00:00:00Z'), // outside the window
      ],
      now,
    )
    expect(months.at(-1)?.amount).toBe(1500)
    expect(months.at(-2)?.amount).toBe(700)
    expect(months.reduce((n, m) => n + m.amount, 0)).toBe(2200)
  })

  it('buckets on Manila time, not UTC', () => {
    // 2026-08-31 17:00 UTC is 2026-09-01 01:00 in Manila.
    const months = revenueByMonth([paid(400, '2026-08-31T17:00:00Z')], now)
    expect(months.at(-1)?.amount).toBe(400)
    expect(months.at(-2)?.amount).toBe(0)
  })

  it('falls back to submittedAt when paidAt is missing', () => {
    const months = revenueByMonth(
      [
        {
          amount: 250,
          statusCode: 'paid',
          paidAt: null,
          submittedAt: '2026-09-05T00:00:00Z',
        },
      ],
      now,
    )
    expect(months.at(-1)?.amount).toBe(250)
  })
})

describe('percentChange', () => {
  it('computes change and guards a zero baseline', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(100, 0)).toBeNull()
  })
})

describe('bookingStatusCounts', () => {
  it('counts per status in lifecycle order', () => {
    const rows = bookingStatusCounts([
      { statusCode: 'cancelled', statusName: 'Cancelled' },
      { statusCode: 'pending', statusName: 'Pending' },
      { statusCode: 'confirmed', statusName: 'Confirmed' },
      { statusCode: 'pending', statusName: 'Pending' },
    ])
    expect(rows.map((r) => [r.code, r.count])).toEqual([
      ['pending', 2],
      ['confirmed', 1],
      ['cancelled', 1],
    ])
  })
})

describe('occupancy', () => {
  const props = [
    { propertyId: 1, name: 'A' },
    { propertyId: 2, name: 'B' },
  ]
  const beds = [
    { propertyId: 1, statusCode: 'occupied' },
    { propertyId: 1, statusCode: 'available' },
    { propertyId: 1, statusCode: 'maintenance' },
    { propertyId: 1, statusCode: 'reserved' },
  ]

  it('excludes maintenance/inactive beds from the denominator', () => {
    const [a, b] = occupancyByProperty(props, beds)
    expect(a).toMatchObject({ occupied: 1, reserved: 1, bookable: 3, total: 4 })
    expect(a.pct).toBeCloseTo(33.33, 1)
    expect(b.pct).toBeNull() // no beds at all
  })

  it('rolls up overall occupancy', () => {
    const overall = overallOccupancy(occupancyByProperty(props, beds))
    expect(overall).toMatchObject({ occupied: 1, bookable: 3 })
  })
})

describe('averageRating', () => {
  it('averages, or returns null for none', () => {
    expect(averageRating([])).toBeNull()
    expect(averageRating([{ rating: 5 }, { rating: 4 }])).toEqual({
      average: 4.5,
      count: 2,
    })
  })
})

describe('niceScale', () => {
  it('rounds the top up to a clean number with even ticks', () => {
    expect(niceScale(8300)).toEqual({ top: 10000, ticks: [0, 5000, 10000] })
    expect(niceScale(4200)).toEqual({ top: 6000, ticks: [0, 2000, 4000, 6000] })
  })

  it('handles an empty series', () => {
    expect(niceScale(0)).toEqual({ top: 1, ticks: [0, 1] })
  })
})
