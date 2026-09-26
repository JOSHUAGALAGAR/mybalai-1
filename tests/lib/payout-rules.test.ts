import { describe, expect, it } from 'vitest'

import {
  daysInMonth,
  effectiveDay,
  feeBreakdown,
  formatPct,
  isWithdrawalDay,
  maskAccountNumber,
  nextWithdrawalDate,
  withdrawalBlocker,
} from '@/lib/payouts/rules'
import { payoutSettingsSchema, withdrawalMethodSchema } from '@/schemas/payouts'

// 12:00 in Manila = 04:00Z
const at = (iso: string) => new Date(`${iso}T04:00:00Z`)

describe('feeBreakdown', () => {
  it('takes 1.5% PayMongo and 1.5% MyBalai off a payment', () => {
    expect(feeBreakdown(1000, { paymongoPct: 1.5, platformPct: 1.5 })).toEqual({
      gross: 1000,
      paymongoFee: 15,
      platformFee: 15,
      net: 970,
    })
  })
  it('rounds each fee to the centavo, like the database does', () => {
    const b = feeBreakdown(20, { paymongoPct: 1.5, platformPct: 1.5 })
    expect(b).toEqual({
      gross: 20,
      paymongoFee: 0.3,
      platformFee: 0.3,
      net: 19.4,
    })
  })
  it('follows whatever rates the admin sets, and never goes below zero', () => {
    expect(feeBreakdown(1000, { paymongoPct: 2, platformPct: 3 }).net).toBe(950)
    expect(feeBreakdown(100, { paymongoPct: 50, platformPct: 50 }).net).toBe(0)
  })
  it('formats a percentage without trailing zeros', () => {
    expect([formatPct(1.5), formatPct(2), formatPct(1.25)]).toEqual([
      '1.5',
      '2',
      '1.25',
    ])
  })
})

describe('withdrawal day', () => {
  it('is the chosen day of the month, on the Philippine calendar', () => {
    expect(isWithdrawalDay(at('2026-10-30'), 30)).toBe(true)
    expect(isWithdrawalDay(at('2026-10-29'), 30)).toBe(false)
    // 17:00Z on the 29th is already 01:00 on the 30th in Manila
    expect(isWithdrawalDay(new Date('2026-10-29T17:00:00Z'), 30)).toBe(true)
  })
  it('uses the last day of a short month', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(effectiveDay(30, 2026, 2)).toBe(28)
    expect(isWithdrawalDay(at('2026-02-28'), 30)).toBe(true)
    expect(isWithdrawalDay(at('2026-04-30'), 31)).toBe(true)
  })
  it('finds the next withdrawal date (today counts)', () => {
    expect(nextWithdrawalDate(at('2026-09-26'), 30)).toBe('2026-09-30')
    expect(nextWithdrawalDate(at('2026-09-30'), 30)).toBe('2026-09-30')
    expect(nextWithdrawalDate(at('2026-10-01'), 30)).toBe('2026-10-30')
    expect(nextWithdrawalDate(at('2026-12-31'), 30)).toBe('2027-01-30')
    expect(nextWithdrawalDate(at('2027-01-31'), 30)).toBe('2027-02-28')
    expect(nextWithdrawalDate(at('2026-09-26'), 15)).toBe('2026-10-15')
  })
})

describe('withdrawalBlocker', () => {
  const base = {
    now: at('2026-09-30'),
    day: 30,
    available: 5000,
    threshold: 1000,
    hasMethod: true,
    hasOpenPayout: false,
  }
  it('lets a landlord withdraw on the day, above the minimum', () => {
    expect(withdrawalBlocker(base)).toBeNull()
  })
  it('explains what is in the way', () => {
    expect(withdrawalBlocker({ ...base, hasOpenPayout: true })).toMatch(
      /still being processed/,
    )
    expect(withdrawalBlocker({ ...base, hasMethod: false })).toMatch(
      /where the money should be sent/,
    )
    expect(withdrawalBlocker({ ...base, now: at('2026-09-29') })).toMatch(
      /day 30/,
    )
    expect(withdrawalBlocker({ ...base, available: 0 })).toMatch(/no earnings/)
    expect(withdrawalBlocker({ ...base, available: 999.99 })).toMatch(
      /minimum withdrawal is ₱1,000/,
    )
  })
})

describe('maskAccountNumber', () => {
  it('keeps only the last four digits', () => {
    expect(maskAccountNumber('0917 123 4567')).toBe('•••• 4567')
    expect(maskAccountNumber('123')).toBe('123')
  })
})

describe('schemas', () => {
  const ok = {
    paymongo_fee_rate: '1.5',
    platform_fee_rate: '1.5',
    withdrawal_day: '30',
    minimum_threshold: '1000',
    hold_days: '3',
  }
  it('accepts sensible settings', () =>
    expect(payoutSettingsSchema.safeParse(ok).success).toBe(true))
  it('rejects nonsense', () => {
    expect(
      payoutSettingsSchema.safeParse({ ...ok, withdrawal_day: '0' }).success,
    ).toBe(false)
    expect(
      payoutSettingsSchema.safeParse({ ...ok, withdrawal_day: '32' }).success,
    ).toBe(false)
    expect(
      payoutSettingsSchema.safeParse({ ...ok, platform_fee_rate: '-1' })
        .success,
    ).toBe(false)
    expect(
      payoutSettingsSchema.safeParse({ ...ok, paymongo_fee_rate: '80' })
        .success,
    ).toBe(false)
    expect(
      payoutSettingsSchema.safeParse({ ...ok, minimum_threshold: 'abc' })
        .success,
    ).toBe(false)
  })
  it('a withdrawal method needs a name and a number', () => {
    const m = {
      method_type: 'gcash',
      account_name: 'Ana Reyes',
      account_number: '0917 123 4567',
    }
    expect(withdrawalMethodSchema.safeParse(m).success).toBe(true)
    expect(
      withdrawalMethodSchema.safeParse({ ...m, method_type: 'paypal' }).success,
    ).toBe(false)
    expect(
      withdrawalMethodSchema.safeParse({ ...m, account_number: 'abc' }).success,
    ).toBe(false)
    expect(
      withdrawalMethodSchema.safeParse({ ...m, account_name: '' }).success,
    ).toBe(false)
  })
})
