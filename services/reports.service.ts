import 'server-only'

import { requireRole } from '@/lib/auth/dal'
import {
  sortBookingStatusCounts,
  type RevenueMonth,
  type StatusCount,
} from '@/lib/dashboard/landlord-metrics'
import { toCsv } from '@/lib/reports/csv'
import {
  amountByMonth,
  countByMonth,
  monthOverMonth,
  sum,
  type CountMonth,
} from '@/lib/reports/platform-metrics'
import { unstable_cache } from 'next/cache'

import * as repo from '@/repositories/reports.repository'
import * as verificationRepo from '@/repositories/verification.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import { recordAudit } from '@/services/audit.service'
import { ServiceError } from '@/services/errors'

const MONTHS = 6

function sinceMonths(now: Date, months: number): string {
  // start of the month `months - 1` months ago (Manila is UTC+8; a day of slack is harmless for a chart window)
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1) -
      8 * 3600_000,
  )
  return d.toISOString()
}

export type PlatformReport = {
  generatedAt: string
  users: {
    total: number
    active: number
    idVerified: number
    byRole: { role: string; count: number }[]
    newByMonth: CountMonth[]
  }
  listings: {
    total: number
    byStatus: { code: string; label: string; count: number }[]
  }
  bookings: {
    total: number
    byStatus: StatusCount[]
    createdByMonth: CountMonth[]
  }
  revenue: {
    bookingMonths: RevenueMonth[]
    bookingThisMonth: number
    bookingChangePct: number | null
    bookingTotal: number
    mybalaiMonths: RevenueMonth[]
    mybalaiThisMonth: number
    mybalaiChangePct: number | null
    mybalaiTotal: number
    feeTotal: number
    refundedTotal: number
    boostTotal: number
  }
  pending: { idVerifications: number; payments: number }
}

/**
 * The report is the same for every admin and only needs to be roughly current, so it is built at
 * most once a minute and shared. (The numbers are counts and 6-month windows, never a full scan.)
 */
const cachedPlatformReport = unstable_cache(
  () => buildPlatformReport(new Date()),
  ['platform-report'],
  { revalidate: 60, tags: ['platform-report'] },
)

export async function getPlatformReport(): Promise<PlatformReport> {
  await requireRole('superadmin')
  return cachedPlatformReport()
}

async function buildPlatformReport(now: Date): Promise<PlatformReport> {
  const since = sinceMonths(now, MONTHS)

  const [paymentStatuses, bookingStatuses, propertyStatuses, roleDefs] =
    await Promise.all([
      referenceRepo.listPaymentStatuses(),
      referenceRepo.listBookingStatuses(),
      referenceRepo.listPropertyStatuses(),
      repo.roleCodes(),
    ])

  const [
    accountTotals,
    signUpDates,
    roleCounts,
    payments,
    bookingCounts,
    bookingRows,
    earnings,
    boosts,
    propertyCounts,
    pendingIdVerifications,
  ] = await Promise.all([
    repo.accountCounts(),
    repo.accountDatesSince(since),
    repo.roleHolderCounts([...roleDefs.keys()]),
    repo.paymentsSince(since),
    repo.bookingCountsByStatus(bookingStatuses.map((s) => s.booking_status_id)),
    repo.bookingsSince(since),
    repo.earningsSince(since),
    repo.paidBoostsSince(since),
    repo.propertyCountsByStatus(
      propertyStatuses.map((s) => s.property_status_id),
    ),
    verificationRepo.countByStatus('pending').catch(() => 0),
  ])

  const paidId = paymentStatuses.find(
    (s) => s.status_code === 'paid',
  )?.payment_status_id
  const pendingId = paymentStatuses.find(
    (s) => s.status_code === 'pending',
  )?.payment_status_id

  const bookingMonths = amountByMonth(
    payments
      .filter((p) => p.payment_status_id === paidId)
      .map((p) => ({
        amount: Number(p.amount),
        at: p.paid_at ?? p.created_at,
      })),
    now,
    MONTHS,
  )
  // What MyBalai earns: its cut of online payments + boosts (PayMongo's fee is not MyBalai income).
  const feeRows = earnings.map((e) => ({
    amount: Number(e.mybalai_revenue), // the platform fee — 0 once the payment was refunded
    at: e.created_at,
  }))
  const boostRows = boosts.map((b) => ({
    amount: Number(b.amount),
    at: b.paid_at ?? b.created_at,
  }))
  const mybalaiMonths = amountByMonth([...feeRows, ...boostRows], now, MONTHS)
  const feeTotal = sum(amountByMonth(feeRows, now, MONTHS))
  const boostTotal = sum(amountByMonth(boostRows, now, MONTHS))
  const bookingMom = monthOverMonth(bookingMonths)
  const mybalaiMom = monthOverMonth(mybalaiMonths)

  const roleTotals = [...roleCounts]
    .map(([id, count]) => ({ role: roleDefs.get(id) ?? `role ${id}`, count }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)

  const bookingStatusById = new Map(
    bookingStatuses.map((s) => [s.booking_status_id, s]),
  )
  const propertyStatusById = new Map(
    propertyStatuses.map((s) => [s.property_status_id, s]),
  )

  return {
    generatedAt: now.toISOString(),
    users: {
      total: accountTotals.total,
      active: accountTotals.active,
      idVerified: accountTotals.idVerified,
      byRole: roleTotals,
      newByMonth: countByMonth(signUpDates, now, MONTHS),
    },
    listings: {
      total: propertyCounts.reduce((n, r) => n + r.count, 0),
      byStatus: propertyCounts
        .map((r) => {
          const s =
            r.status_id != null
              ? propertyStatusById.get(r.status_id)
              : undefined
          return {
            code: s?.status_code ?? 'unknown',
            label: s?.status_name ?? 'No status',
            count: r.count,
          }
        })
        .sort((a, b) => b.count - a.count),
    },
    bookings: {
      total: bookingCounts.reduce((n, r) => n + r.count, 0),
      byStatus: sortBookingStatusCounts(
        bookingCounts.map((r) => {
          const st =
            r.status_id != null ? bookingStatusById.get(r.status_id) : undefined
          return {
            code: st?.status_code ?? 'unknown',
            label: st?.status_name ?? 'Unknown',
            count: r.count,
          }
        }),
      ),
      createdByMonth: countByMonth(
        bookingRows.map((b) => b.created_at),
        now,
        MONTHS,
      ),
    },
    revenue: {
      bookingMonths,
      bookingThisMonth: bookingMom.thisMonth,
      bookingChangePct: bookingMom.changePct,
      bookingTotal: sum(bookingMonths),
      mybalaiMonths,
      mybalaiThisMonth: mybalaiMom.thisMonth,
      mybalaiChangePct: mybalaiMom.changePct,
      mybalaiTotal: sum(mybalaiMonths),
      feeTotal,
      refundedTotal: earnings.reduce((n, e) => n + Number(e.refund_amount), 0),
      boostTotal,
    },
    pending: {
      idVerifications: pendingIdVerifications,
      payments: await repo.pendingPaymentCount(pendingId),
    },
  }
}

/* ---- CSV exports ---- */

export const EXPORT_KINDS = ['payments', 'bookings', 'users', 'boosts'] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]

function isoRange(
  from?: string,
  to?: string,
): { since: string; until?: string } {
  const date = /^\d{4}-\d{2}-\d{2}$/
  const since =
    from && date.test(from) ? `${from}T00:00:00+08:00` : '2000-01-01T00:00:00Z'
  const until = to && date.test(to) ? `${to}T23:59:59+08:00` : undefined
  if (
    Number.isNaN(Date.parse(since)) ||
    (until && Number.isNaN(Date.parse(until)))
  ) {
    throw new ServiceError('Enter valid dates.', 'validation')
  }
  return { since, until }
}

export async function exportReportCsv(
  kind: ExportKind,
  range: { from?: string; to?: string },
): Promise<{ filename: string; csv: string }> {
  const actor = await requireRole('superadmin')
  const { since, until } = isoRange(range.from, range.to)
  const stamp = new Date().toISOString().slice(0, 10)
  let csv: string
  let count = 0

  if (kind === 'users') {
    const [accounts, userRoles, roles] = await Promise.all([
      repo.allAccounts(),
      repo.allUserRoles(),
      repo.roleCodes(),
    ])
    const rolesByUser = new Map<number, string[]>()
    for (const ur of userRoles) {
      const code = roles.get(ur.role_id)
      if (code)
        rolesByUser.set(ur.legacy_user_id, [
          ...(rolesByUser.get(ur.legacy_user_id) ?? []),
          code,
        ])
    }
    const rows = accounts.filter(
      (a) => a.created_at >= since && (!until || a.created_at <= until),
    )
    count = rows.length
    csv = toCsv(
      [
        'User ID',
        'Name',
        'Email',
        'Phone',
        'Roles',
        'Active',
        'ID verified',
        'Joined',
      ],
      rows.map((a) => [
        a.legacy_user_id,
        a.full_name,
        a.email,
        a.phone,
        (rolesByUser.get(a.legacy_user_id) ?? []).join(' '),
        a.is_active ? 'yes' : 'no',
        a.id_verified_at ? 'yes' : 'no',
        a.created_at,
      ]),
    )
  } else {
    const accounts = new Map(
      (await repo.allAccounts()).map((a) => [a.legacy_user_id, a]),
    )
    const who = (id: number) =>
      accounts.get(id)?.full_name || accounts.get(id)?.email || `User #${id}`
    if (kind === 'payments') {
      const [rows, statuses, methods] = await Promise.all([
        repo.paymentsSince(since, until),
        referenceRepo.listPaymentStatuses(),
        referenceRepo.listPaymentMethods(),
      ])
      const statusName = new Map(
        statuses.map((s) => [s.payment_status_id, s.status_name]),
      )
      const methodName = new Map(
        methods.map((m) => [m.payment_method_id, m.method_name]),
      )
      count = rows.length
      csv = toCsv(
        [
          'Payment ID',
          'Booking ID',
          'Payer',
          'Amount',
          'Currency',
          'Status',
          'Method',
          'Channel',
          'Reference',
          'Paid at',
          'Created',
        ],
        rows.map((p) => [
          p.payment_id,
          p.booking_id,
          who(p.user_id),
          p.amount,
          p.currency,
          p.payment_status_id != null
            ? statusName.get(p.payment_status_id)
            : '',
          p.payment_method_id != null
            ? methodName.get(p.payment_method_id)
            : '',
          p.paid_channel,
          p.reference_number,
          p.paid_at,
          p.created_at,
        ]),
      )
    } else if (kind === 'bookings') {
      const [rows, statuses] = await Promise.all([
        repo.bookingsSince(since, until),
        referenceRepo.listBookingStatuses(),
      ])
      const statusName = new Map(
        statuses.map((s) => [s.booking_status_id, s.status_name]),
      )
      count = rows.length
      csv = toCsv(
        [
          'Booking ID',
          'Tenant',
          'Property ID',
          'Status',
          'Check-in',
          'Check-out',
          'Total',
          'Currency',
          'Created',
        ],
        rows.map((b) => [
          b.booking_id,
          who(b.user_id),
          b.property_id,
          b.booking_status_id != null
            ? statusName.get(b.booking_status_id)
            : '',
          b.check_in_date,
          b.check_out_date,
          b.total_amount,
          b.currency,
          b.created_at,
        ]),
      )
    } else {
      const rows = await repo.paidBoostsSince(since, until)
      count = rows.length
      csv = toCsv(
        [
          'Boost ID',
          'Landlord',
          'Property ID',
          'Days',
          'Amount',
          'PayMongo fee',
          'Status',
          'Paid at',
          'Created',
        ],
        rows.map((o) => [
          o.boost_id,
          who(o.landlord_id),
          o.property_id,
          o.days,
          o.amount,
          o.processing_fee_amount,
          o.status,
          o.paid_at,
          o.created_at,
        ]),
      )
    }
  }

  await recordAudit({
    actor,
    action: 'report.exported',
    targetType: 'report',
    targetId: kind,
    summary: `Exported ${count} ${kind} to CSV`,
    details: {
      kind,
      rows: count,
      from: range.from ?? null,
      to: range.to ?? null,
    },
  })
  return { filename: `mybalai-${kind}-${stamp}.csv`, csv }
}
