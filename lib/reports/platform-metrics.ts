import { percentChange, revenueByMonth } from '@/lib/dashboard/landlord-metrics'
import type { RevenueMonth } from '@/lib/dashboard/landlord-metrics'

/* Pure aggregation for the admin reports page — no I/O, so it is unit-tested directly. */

export type CountMonth = {
  key: string
  label: string
  year: number
  count: number
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function manila(date: Date) {
  const s = new Date(date.getTime() + MANILA_OFFSET_MS)
  return { year: s.getUTCFullYear(), month: s.getUTCMonth() }
}

/** Number of events per month for the last `months` months (Manila calendar), oldest first. */
export function countByMonth(
  dates: string[],
  now: Date,
  months = 6,
): CountMonth[] {
  const { year, month } = manila(now)
  const buckets: CountMonth[] = []
  for (let i = months - 1; i >= 0; i--) {
    const index = year * 12 + month - i
    const y = Math.floor(index / 12)
    const m = index % 12
    buckets.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: MONTH_LABELS[m],
      year: y,
      count: 0,
    })
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]))
  for (const d of dates) {
    const when = manila(new Date(d))
    const bucket = byKey.get(
      `${when.year}-${String(when.month + 1).padStart(2, '0')}`,
    )
    if (bucket) bucket.count += 1
  }
  return buckets
}

/** Sum of amounts per month; the same shape the revenue chart draws. */
export function amountByMonth(
  rows: { amount: number; at: string }[],
  now: Date,
  months = 6,
): RevenueMonth[] {
  return revenueByMonth(
    rows.map((r) => ({
      amount: r.amount,
      statusCode: 'paid',
      paidAt: r.at,
      submittedAt: r.at,
    })),
    now,
    months,
  )
}

export function monthOverMonth(months: RevenueMonth[]): {
  thisMonth: number
  lastMonth: number
  changePct: number | null
} {
  const thisMonth = months.at(-1)?.amount ?? 0
  const lastMonth = months.at(-2)?.amount ?? 0
  return {
    thisMonth,
    lastMonth,
    changePct: percentChange(thisMonth, lastMonth),
  }
}

export function sum(months: { amount: number }[]): number {
  return months.reduce((n, m) => n + m.amount, 0)
}
