import 'server-only'

import { requireRole } from '@/lib/auth/dal'
import {
  bookingStatusCounts,
  percentChange,
  revenueByMonth,
  type OccupancyRow,
  type RevenueMonth,
  type StatusCount,
} from '@/lib/dashboard/landlord-metrics'
import { countByMonth, type CountMonth } from '@/lib/reports/platform-metrics'
import { toCsv } from '@/lib/reports/csv'
import { listManagedBookings } from '@/services/bookings.service'
import { getLandlordDashboard } from '@/services/landlord-dashboard.service'
import { listMyTenants } from '@/services/landlord-tenants.service'
import { listManagedPayments } from '@/services/payments.service'
import { ServiceError } from '@/services/errors'

export const REPORT_RANGES = [3, 6, 12] as const
export type ReportRange = (typeof REPORT_RANGES)[number]

export const parseRange = (value: unknown): ReportRange =>
  REPORT_RANGES.find((r) => String(r) === value) ?? 6

export type PropertyRevenue = { name: string; amount: number; payments: number }

export type LandlordReport = {
  range: ReportRange
  revenue: {
    months: RevenueMonth[]
    total: number
    thisMonth: number
    changePct: number | null
    byProperty: PropertyRevenue[]
    /** Money waiting for you to verify. */
    pendingAmount: number
  }
  bookings: {
    total: number
    inRange: number
    createdByMonth: CountMonth[]
    byStatus: StatusCount[]
    averageValue: number | null
  }
  payments: { byStatus: StatusCount[] }
  occupancy: {
    overall: { occupied: number; bookable: number; pct: number | null }
    byProperty: OccupancyRow[]
  }
  rating: { average: number; count: number } | null
}

export async function getLandlordReport(
  range: ReportRange = 6,
  now = new Date(),
): Promise<LandlordReport> {
  await requireRole('landlord', 'superadmin')
  const [dashboard, payments, bookings] = await Promise.all([
    getLandlordDashboard(),
    listManagedPayments('landlord'),
    listManagedBookings('landlord'),
  ])

  const months = revenueByMonth(payments, now, range)
  const windowKeys = new Set(months.map((m) => m.key))
  const monthKey = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 8 * 3600_000)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }

  const byProperty = new Map<string, PropertyRevenue>()
  for (const p of payments) {
    if (p.statusCode !== 'paid') continue
    if (!windowKeys.has(monthKey(p.paidAt ?? p.submittedAt))) continue
    const name = p.propertyName ?? 'Unknown property'
    const row = byProperty.get(name) ?? { name, amount: 0, payments: 0 }
    row.amount += p.amount
    row.payments += 1
    byProperty.set(name, row)
  }

  const createdByMonth = countByMonth(
    bookings.map((b) => b.submittedAt),
    now,
    range,
  )
  const inRangeBookings = bookings.filter((b) =>
    windowKeys.has(monthKey(b.submittedAt)),
  )
  const confirmed = inRangeBookings.filter((b) =>
    ['confirmed', 'checked_in', 'checked_out'].includes(b.statusCode ?? ''),
  )
  const thisMonth = months.at(-1)?.amount ?? 0

  return {
    range,
    revenue: {
      months,
      total: months.reduce((n, m) => n + m.amount, 0),
      thisMonth,
      changePct: percentChange(thisMonth, months.at(-2)?.amount ?? 0),
      byProperty: [...byProperty.values()].sort((a, b) => b.amount - a.amount),
      pendingAmount: payments
        .filter((p) => p.statusCode === 'pending')
        .reduce((n, p) => n + p.amount, 0),
    },
    bookings: {
      total: bookings.length,
      inRange: inRangeBookings.length,
      createdByMonth,
      byStatus: bookingStatusCounts(bookings),
      averageValue:
        confirmed.length > 0
          ? confirmed.reduce((n, b) => n + b.totalAmount, 0) / confirmed.length
          : null,
    },
    payments: {
      byStatus: bookingStatusCountsLike(
        payments.map((p) => ({ code: p.statusCode, name: p.statusName })),
      ),
    },
    occupancy: dashboard.occupancy,
    rating: dashboard.rating,
  }
}

function bookingStatusCountsLike(
  rows: { code: string | null; name: string | null }[],
): StatusCount[] {
  const counts = new Map<string, StatusCount>()
  for (const r of rows) {
    const code = r.code ?? 'unknown'
    const row = counts.get(code) ?? { code, label: r.name ?? code, count: 0 }
    row.count += 1
    counts.set(code, row)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

/* ---- CSV exports (landlord-scoped: the lists below only ever contain this landlord's data) ---- */

export const LANDLORD_EXPORT_KINDS = [
  'payments',
  'bookings',
  'tenants',
] as const
export type LandlordExportKind = (typeof LANDLORD_EXPORT_KINDS)[number]

const DAY = /^\d{4}-\d{2}-\d{2}$/
const manilaDay = (iso: string) =>
  new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10)

export async function exportLandlordCsv(
  kind: LandlordExportKind,
  range: { from?: string; to?: string },
): Promise<{ filename: string; csv: string }> {
  await requireRole('landlord', 'superadmin')
  if (
    (range.from && !DAY.test(range.from)) ||
    (range.to && !DAY.test(range.to))
  ) {
    throw new ServiceError('Enter valid dates.', 'validation')
  }
  const inRange = (iso: string) => {
    const day = manilaDay(iso)
    return (!range.from || day >= range.from) && (!range.to || day <= range.to)
  }
  const stamp = new Date().toISOString().slice(0, 10)
  let csv: string

  if (kind === 'payments') {
    const rows = (await listManagedPayments('landlord')).filter((p) =>
      inRange(p.submittedAt),
    )
    csv = toCsv(
      [
        'Payment ID',
        'Booking ID',
        'Property',
        'Payer',
        'Amount',
        'Currency',
        'Status',
        'Method',
        'Reference',
        'Paid at',
        'Submitted',
      ],
      rows.map((p) => [
        p.paymentId,
        p.bookingId,
        p.propertyName,
        p.payerName,
        p.amount,
        p.currency,
        p.statusName,
        p.methodName,
        p.reference,
        p.paidAt,
        p.submittedAt,
      ]),
    )
  } else if (kind === 'bookings') {
    const rows = (await listManagedBookings('landlord')).filter((b) =>
      inRange(b.submittedAt),
    )
    csv = toCsv(
      [
        'Booking ID',
        'Property',
        'Room',
        'Bed',
        'Tenant',
        'Check-in',
        'Check-out',
        'Status',
        'Total',
        'Currency',
        'Submitted',
      ],
      rows.map((b) => [
        b.bookingId,
        b.propertyName,
        b.roomLabel,
        b.bedNumber,
        b.tenantName,
        b.checkIn,
        b.checkOut,
        b.statusName,
        b.totalAmount,
        b.currency,
        b.submittedAt,
      ]),
    )
  } else {
    const tenants = await listMyTenants('landlord')
    csv = toCsv(
      [
        'Tenant',
        'Email',
        'Phone',
        'ID verified',
        'Now',
        'Property',
        'Room',
        'Bed',
        'Check-in',
        'Check-out',
        'Booking ID',
        'Status',
      ],
      tenants.flatMap((t) =>
        t.stays.map((s) => [
          t.name,
          t.email,
          t.phone,
          t.idVerified ? 'yes' : 'no',
          t.phase,
          s.propertyName,
          s.roomLabel,
          s.bedNumber,
          s.checkIn,
          s.checkOut,
          s.bookingId,
          s.statusName,
        ]),
      ),
    )
  }
  return { filename: `mybalai-${kind}-${stamp}.csv`, csv }
}
