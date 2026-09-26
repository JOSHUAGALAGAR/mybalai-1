import { describe, expect, it } from 'vitest'

import { toCsv } from '@/lib/reports/csv'
import {
  amountByMonth,
  countByMonth,
  monthOverMonth,
} from '@/lib/reports/platform-metrics'

describe('toCsv', () => {
  it('quotes commas, quotes and newlines, and starts with a BOM for Excel', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['x,y', 'say "hi"'],
        ['line\nbreak', 3],
      ],
    )
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('a,b\r\n')
    expect(csv).toContain('"x,y","say ""hi"""')
    expect(csv).toContain('"line\nbreak",3')
  })

  it('renders null / undefined as empty cells', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, false]])).toContain(
      '\r\n,,false\r\n',
    )
  })

  it('defuses spreadsheet formulas but leaves numbers alone', () => {
    const csv = toCsv(
      ['v'],
      [['=HYPERLINK("http://evil")'], ['+1'], ['-2'], ['@SUM(A1)'], [-5]],
    )
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(csv).toContain("'+1")
    expect(csv).toContain("'-2")
    expect(csv).toContain("'@SUM(A1)")
    expect(csv).toContain('\r\n-5\r\n') // a real number stays a number
  })
})

describe('platform metrics', () => {
  const now = new Date('2026-09-25T04:00:00Z') // 12:00 in Manila

  it('buckets events by Manila month, oldest first, with empty months kept', () => {
    const months = countByMonth(
      [
        '2026-09-01T00:30:00+08:00',
        '2026-08-31T23:30:00+08:00', // 15:30Z on Aug 31: still August in Manila (23:30 local)
        '2026-09-20T10:00:00Z',
        '2025-01-01T00:00:00Z', // outside the window
      ],
      now,
      3,
    )
    expect(months.map((m) => m.key)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(months.map((m) => m.count)).toEqual([0, 1, 2])
  })

  it('sums amounts per month and reports the month-over-month change', () => {
    const months = amountByMonth(
      [
        { amount: 1000, at: '2026-08-10T00:00:00Z' },
        { amount: 1500, at: '2026-09-02T00:00:00Z' },
        { amount: 500, at: '2026-09-03T00:00:00Z' },
      ],
      now,
      2,
    )
    expect(months.map((m) => m.amount)).toEqual([1000, 2000])
    expect(monthOverMonth(months)).toEqual({
      thisMonth: 2000,
      lastMonth: 1000,
      changePct: 100,
    })
  })

  it('has no percent change when last month had no revenue', () => {
    const months = amountByMonth(
      [{ amount: 300, at: '2026-09-02T00:00:00Z' }],
      now,
      2,
    )
    expect(monthOverMonth(months).changePct).toBeNull()
  })
})

describe('legacy audit rows', () => {
  it('describes rows the database wrote itself', async () => {
    const { describeLegacyAudit, auditActionLabel } =
      await import('@/lib/audit/actions')
    expect(describeLegacyAudit('payment_created', 'payment', 1000015)).toBe(
      'Payment created — payment #1000015',
    )
    expect(describeLegacyAudit('login', null, null)).toBe('Login')
    expect(auditActionLabel('payment_created')).toBe('Payment created')
    expect(auditActionLabel('user.deactivated')).toBe('Account deactivated')
  })
})

describe('portal_ads roles column', () => {
  it('reads comma-separated roles, treating empty / legacy "all" as everyone', async () => {
    const { parseRoles } = await import('@/repositories/ads.repository')
    expect(parseRoles('tenant,landlord')).toEqual(['tenant', 'landlord'])
    expect(parseRoles(' Tenant , bogus ')).toEqual(['tenant'])
    expect(parseRoles(null)).toEqual(['tenant', 'landlord', 'caretaker'])
    expect(parseRoles('all')).toEqual(['tenant', 'landlord', 'caretaker'])
  })
})
