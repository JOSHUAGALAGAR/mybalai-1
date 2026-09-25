/**
 * Pure aggregation helpers for the landlord dashboard charts. No I/O here so
 * they can be unit-tested; `services/landlord-dashboard.service.ts` feeds them.
 */

// Philippines has no DST; bucket months on Manila wall-clock time so a payment
// at 23:30 on the 31st isn't counted in the next month on a UTC server.
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
] as const

function manilaMonth(date: Date): { year: number; month: number } {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() }
}

/* ---- revenue ---- */

export type PaymentInput = {
  amount: number
  statusCode: string | null
  paidAt: string | null
  submittedAt: string
}

export type RevenueMonth = {
  key: string // 2026-09
  label: string // Sep
  year: number
  amount: number
}

/** Verified (`paid`) revenue for the last `months` months, oldest first. */
export function revenueByMonth(
  payments: PaymentInput[],
  now: Date,
  months = 6,
): RevenueMonth[] {
  const { year, month } = manilaMonth(now)
  const buckets: RevenueMonth[] = []
  for (let i = months - 1; i >= 0; i--) {
    const index = year * 12 + month - i
    const y = Math.floor(index / 12)
    const m = index % 12
    buckets.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: MONTH_LABELS[m],
      year: y,
      amount: 0,
    })
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]))

  for (const p of payments) {
    if (p.statusCode !== 'paid') continue
    const when = manilaMonth(new Date(p.paidAt ?? p.submittedAt))
    const bucket = byKey.get(
      `${when.year}-${String(when.month + 1).padStart(2, '0')}`,
    )
    if (bucket) bucket.amount += p.amount
  }
  return buckets
}

/** Percent change from `previous` to `current`; null when there's no baseline. */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

/* ---- bookings ---- */

export type BookingInput = {
  statusCode: string | null
  statusName: string | null
}
export type StatusCount = { code: string; label: string; count: number }

// Lifecycle order, so the chart reads top-to-bottom like a booking's journey.
const BOOKING_STATUS_ORDER = [
  'pending',
  'payment_pending',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'rejected',
  'expired',
]

export function bookingStatusCounts(bookings: BookingInput[]): StatusCount[] {
  const counts = new Map<string, StatusCount>()
  for (const b of bookings) {
    const code = b.statusCode ?? 'unknown'
    const row = counts.get(code) ?? {
      code,
      label: b.statusName ?? code,
      count: 0,
    }
    row.count += 1
    counts.set(code, row)
  }
  const rank = (code: string) => {
    const i = BOOKING_STATUS_ORDER.indexOf(code)
    return i === -1 ? BOOKING_STATUS_ORDER.length : i
  }
  return [...counts.values()].sort((a, b) => rank(a.code) - rank(b.code))
}

/* ---- occupancy ---- */

export type BedInput = { propertyId: number; statusCode: string | null }
export type OccupancyRow = {
  propertyId: number
  name: string
  occupied: number
  reserved: number
  /** Beds that can be let: everything except maintenance / inactive. */
  bookable: number
  total: number
  /** 0-100, or null when the property has no bookable beds. */
  pct: number | null
}

const UNBOOKABLE_BED_STATUSES = new Set(['maintenance', 'inactive'])

export function occupancyByProperty(
  properties: { propertyId: number; name: string }[],
  beds: BedInput[],
): OccupancyRow[] {
  return properties.map((p) => {
    const mine = beds.filter((b) => b.propertyId === p.propertyId)
    const bookable = mine.filter(
      (b) => !UNBOOKABLE_BED_STATUSES.has(b.statusCode ?? ''),
    ).length
    const occupied = mine.filter((b) => b.statusCode === 'occupied').length
    const reserved = mine.filter((b) => b.statusCode === 'reserved').length
    return {
      propertyId: p.propertyId,
      name: p.name,
      occupied,
      reserved,
      bookable,
      total: mine.length,
      pct: bookable > 0 ? (occupied / bookable) * 100 : null,
    }
  })
}

export function overallOccupancy(rows: OccupancyRow[]): {
  occupied: number
  bookable: number
  pct: number | null
} {
  const occupied = rows.reduce((n, r) => n + r.occupied, 0)
  const bookable = rows.reduce((n, r) => n + r.bookable, 0)
  return {
    occupied,
    bookable,
    pct: bookable > 0 ? (occupied / bookable) * 100 : null,
  }
}

/* ---- ratings ---- */

export function averageRating(
  ratings: { rating: number }[],
): { average: number; count: number } | null {
  if (ratings.length === 0) return null
  const sum = ratings.reduce((n, r) => n + r.rating, 0)
  return { average: sum / ratings.length, count: ratings.length }
}

/* ---- axis ---- */

/** Round the axis top up to a clean number and return evenly spaced ticks. */
export function niceScale(
  max: number,
  targetTicks = 4,
): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] }
  const raw = max / targetTicks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const frac = raw / pow
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  return { top, ticks }
}
