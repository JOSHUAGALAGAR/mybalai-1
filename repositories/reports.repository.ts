import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'

const PAGE = 1000

/** PostgREST returns at most 1000 rows per request: walk the whole result. */
async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new RepositoryError(`Failed to load ${what}.`, error)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

export type PaymentReportRow = {
  payment_id: number
  booking_id: number | null
  user_id: number
  amount: number
  currency: string
  payment_status_id: number | null
  payment_method_id: number | null
  paid_channel: string | null
  reference_number: string | null
  paid_at: string | null
  created_at: string
}

export function paymentsSince(
  since: string,
  until?: string,
): Promise<PaymentReportRow[]> {
  return fetchAll<PaymentReportRow>((from, to) => {
    let q = createAdminClient()
      .from('payments')
      .select(
        'payment_id, booking_id, user_id, amount, currency, payment_status_id, payment_method_id, paid_channel, reference_number, paid_at, created_at',
      )
      .is('deleted_at', null)
      .gte('created_at', since)
      .order('payment_id', { ascending: true })
      .range(from, to)
    if (until) q = q.lte('created_at', until)
    return q
  }, 'payments')
}

export type BookingReportRow = {
  booking_id: number
  user_id: number
  property_id: number
  booking_status_id: number | null
  check_in_date: string
  check_out_date: string
  total_amount: number
  currency: string
  created_at: string
}

export function bookingsSince(
  since: string,
  until?: string,
): Promise<BookingReportRow[]> {
  return fetchAll<BookingReportRow>((from, to) => {
    let q = createAdminClient()
      .from('bookings')
      .select(
        'booking_id, user_id, property_id, booking_status_id, check_in_date, check_out_date, total_amount, currency, created_at',
      )
      .is('deleted_at', null)
      .gte('created_at', since)
      .order('booking_id', { ascending: true })
      .range(from, to)
    if (until) q = q.lte('created_at', until)
    return q
  }, 'bookings')
}

export type EarningReportRow = {
  earning_id: number
  landlord_id: number
  payment_id: number
  gross_amount: number
  service_fee_amount: number
  processing_fee_amount: number
  net_amount: number
  refund_amount: number
  mybalai_revenue: number
  created_at: string
}

/** What MyBalai keeps from online payments: one row per earning, with the fee snapshot. */
export function earningsSince(
  since: string,
  until?: string,
): Promise<EarningReportRow[]> {
  return fetchAll<EarningReportRow>((from, to) => {
    let q = createAdminClient()
      .from('landlord_earnings')
      .select(
        'earning_id, landlord_id, payment_id, gross_amount, service_fee_amount, processing_fee_amount, net_amount, refund_amount, mybalai_revenue, created_at',
      )
      .gte('created_at', since)
      .order('earning_id', { ascending: true })
      .range(from, to)
    if (until) q = q.lte('created_at', until)
    return q
  }, 'earnings')
}

export type BoostReportRow = {
  boost_id: number
  landlord_id: number
  property_id: number
  days: number | null
  amount: number
  processing_fee_amount: number
  status: string
  paid_at: string | null
  created_at: string
}

/** Boosts that were actually paid for. */
export function paidBoostsSince(
  since: string,
  until?: string,
): Promise<BoostReportRow[]> {
  return fetchAll<BoostReportRow>((from, to) => {
    let q = createAdminClient()
      .from('property_boosts')
      .select(
        'boost_id, landlord_id, property_id, days, amount, processing_fee_amount, status, paid_at, created_at',
      )
      .in('status', ['active', 'expired'])
      .gte('created_at', since)
      .order('boost_id', { ascending: true })
      .range(from, to)
    if (until) q = q.lte('created_at', until)
    return q
  }, 'boosts')
}

export type AccountReportRow = {
  legacy_user_id: number
  full_name: string | null
  email: string | null
  phone: string | null
  is_active: boolean
  id_verified_at: string | null
  created_at: string
}

export function allAccounts(): Promise<AccountReportRow[]> {
  return fetchAll<AccountReportRow>(
    (from, to) =>
      createAdminClient()
        .from('user_accounts')
        .select(
          'legacy_user_id, full_name, email, phone, is_active, id_verified_at, created_at',
        )
        .order('legacy_user_id', { ascending: true })
        .range(from, to),
    'accounts',
  )
}

export function allUserRoles(): Promise<
  { legacy_user_id: number; role_id: number }[]
> {
  return fetchAll(
    (from, to) =>
      createAdminClient()
        .from('user_roles')
        .select('legacy_user_id, role_id')
        .order('legacy_user_id')
        .range(from, to),
    'roles',
  )
}

/** A `count` query returns no rows — just the number. */
function unwrapCount(
  result: { count: number | null; error: { message: string } | null },
  what: string,
): number {
  if (result.error)
    throw new RepositoryError(`Failed to count ${what}.`, result.error)
  return result.count ?? 0
}

const head = { count: 'exact', head: true } as const

export type AccountCounts = {
  total: number
  active: number
  idVerified: number
}

/** Totals without downloading a single account. */
export async function accountCounts(): Promise<AccountCounts> {
  const db = createAdminClient()
  const [total, active, idVerified] = await Promise.all([
    db.from('user_accounts').select('*', head),
    db.from('user_accounts').select('*', head).eq('is_active', true),
    db
      .from('user_accounts')
      .select('*', head)
      .not('id_verified_at', 'is', null),
  ])
  return {
    total: unwrapCount(total, 'accounts'),
    active: unwrapCount(active, 'accounts'),
    idVerified: unwrapCount(idVerified, 'accounts'),
  }
}

/** Sign-up dates in a window (just the timestamps), for the monthly chart. */
export async function accountDatesSince(since: string): Promise<string[]> {
  const rows = await fetchAll<{ created_at: string }>(
    (from, to) =>
      createAdminClient()
        .from('user_accounts')
        .select('created_at')
        .gte('created_at', since)
        .order('legacy_user_id')
        .range(from, to),
    'sign-ups',
  )
  return rows.map((r) => r.created_at)
}

/** How many people hold each role (one count per role). */
export async function roleHolderCounts(
  roleIds: number[],
): Promise<Map<number, number>> {
  const db = createAdminClient()
  const results = await Promise.all(
    roleIds.map((id) =>
      db.from('user_roles').select('*', head).eq('role_id', id),
    ),
  )
  return new Map(roleIds.map((id, i) => [id, unwrapCount(results[i], 'roles')]))
}

/** Listings per status: one count per status instead of downloading every property. */
export async function propertyCountsByStatus(
  statusIds: number[],
): Promise<{ status_id: number | null; count: number }[]> {
  const db = createAdminClient()
  const results = await Promise.all(
    statusIds.map((id) =>
      db
        .from('properties')
        .select('*', head)
        .is('deleted_at', null)
        .eq('status_id', id),
    ),
  )
  return statusIds
    .map((id, i) => ({
      status_id: id,
      count: unwrapCount(results[i], 'properties'),
    }))
    .filter((r) => r.count > 0)
}

/** Bookings per status: one count per status instead of downloading every booking. */
export async function bookingCountsByStatus(
  statusIds: number[],
): Promise<{ status_id: number | null; count: number }[]> {
  const db = createAdminClient()
  const results = await Promise.all(
    statusIds.map((id) =>
      db
        .from('bookings')
        .select('*', head)
        .is('deleted_at', null)
        .eq('booking_status_id', id),
    ),
  )
  return statusIds
    .map((id, i) => ({
      status_id: id,
      count: unwrapCount(results[i], 'bookings'),
    }))
    .filter((r) => r.count > 0)
}

export async function roleCodes(): Promise<Map<number, string>> {
  const { data, error } = await createAdminClient()
    .from('roles')
    .select('role_id, role_code')
  if (error) throw new RepositoryError('Failed to load roles.', error)
  return new Map((data ?? []).map((r) => [r.role_id, r.role_code]))
}

export async function pendingPaymentCount(
  pendingStatusId: number | undefined,
): Promise<number> {
  if (!pendingStatusId) return 0
  const { count, error } = await createAdminClient()
    .from('payments')
    .select('payment_id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('payment_status_id', pendingStatusId)
  if (error) throw new RepositoryError('Failed to count payments.', error)
  return count ?? 0
}
