import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type PackageRow = Tables<'boost_packages'>
export type BoostRow = Tables<'property_boosts'>

const db = () => createAdminClient()

/* ---- packages ---- */

export async function listPackages(
  options: { activeOnly?: boolean } = {},
): Promise<PackageRow[]> {
  let q = db()
    .from('boost_packages')
    .select('*')
    .order('sort_order')
    .order('package_id')
  if (options.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw new RepositoryError('Failed to load boost packages.', error)
  return data ?? []
}

export async function getPackage(id: number): Promise<PackageRow | null> {
  const { data, error } = await db()
    .from('boost_packages')
    .select('*')
    .eq('package_id', id)
    .maybeSingle()
  if (error)
    throw new RepositoryError('Failed to load the boost package.', error)
  return data
}

export async function insertPackage(values: {
  name: string
  days: number
  price: number
  is_active: boolean
  sort_order: number
}): Promise<PackageRow> {
  const { data, error } = await db()
    .from('boost_packages')
    .insert(values)
    .select('*')
    .single()
  if (error || !data)
    throw new RepositoryError('Failed to create the boost package.', error)
  return data
}

export async function updatePackage(
  id: number,
  values: { name: string; days: number; price: number; is_active: boolean },
): Promise<void> {
  const { error } = await db()
    .from('boost_packages')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('package_id', id)
  if (error)
    throw new RepositoryError('Failed to update the boost package.', error)
}

/* ---- boosts ---- */

export async function insertPending(values: {
  property_id: number
  landlord_id: number
  package_id: number
  days: number
  amount: number
}): Promise<BoostRow> {
  const { data, error } = await db()
    .from('property_boosts')
    .insert({ ...values, status: 'pending', is_active: false, ends_at: null })
    .select('*')
    .single()
  if (error || !data)
    throw new RepositoryError('Failed to start the boost.', error)
  return data
}

/** Stale, never-paid checkouts of a property: called before starting a new one. */
export async function cancelPendingFor(propertyId: number): Promise<void> {
  const { error } = await db()
    .from('property_boosts')
    .update({
      status: 'cancelled',
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('property_id', propertyId)
    .eq('status', 'pending')
  if (error) throw new RepositoryError('Failed to clear old checkouts.', error)
}

export async function attachSession(
  boostId: number,
  sessionId: string,
): Promise<void> {
  const { error } = await db()
    .from('property_boosts')
    .update({
      paymongo_session_id: sessionId,
      updated_at: new Date().toISOString(),
    })
    .eq('boost_id', boostId)
  if (error) throw new RepositoryError('Failed to link the checkout.', error)
}

export async function getBoost(id: number): Promise<BoostRow | null> {
  const { data, error } = await db()
    .from('property_boosts')
    .select('*')
    .eq('boost_id', id)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the boost.', error)
  return data
}

export async function getBoostBySession(
  sessionId: string,
): Promise<BoostRow | null> {
  const { data, error } = await db()
    .from('property_boosts')
    .select('*')
    .eq('paymongo_session_id', sessionId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the boost.', error)
  return data
}

export async function listByLandlord(landlordId: number): Promise<BoostRow[]> {
  const { data, error } = await db()
    .from('property_boosts')
    .select('*')
    .eq('landlord_id', landlordId)
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load boosts.', error)
  return data ?? []
}

export async function listAll(limit = 200): Promise<BoostRow[]> {
  const { data, error } = await db()
    .from('property_boosts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new RepositoryError('Failed to load boosts.', error)
  return data ?? []
}

/** Property ids that are boosted right now (paid, started, not ended). */
export async function liveBoostedPropertyIds(
  nowIso: string,
): Promise<Set<number>> {
  const { data, error } = await db()
    .from('property_boosts')
    .select('property_id')
    .eq('status', 'active')
    .lte('starts_at', nowIso)
    .gt('ends_at', nowIso)
  if (error) throw new RepositoryError('Failed to load boosts.', error)
  return new Set((data ?? []).map((r) => r.property_id))
}

export async function callSettle(
  boostId: number,
  paymongoPaymentId: string | null,
): Promise<string> {
  const { data, error } = await db().rpc('settle_property_boost', {
    p_boost: boostId,
    p_paymongo_payment_id: paymongoPaymentId,
  })
  if (error) throw new RepositoryError('Failed to activate the boost.', error)
  return String(data)
}

/** Mark boosts whose time ran out as expired. Best-effort housekeeping: the live check never depends on it. */
export async function expireEnded(): Promise<void> {
  const { error } = await db().rpc('expire_property_boosts')
  if (error) throw new RepositoryError('Failed to expire boosts.', error)
}

/** Stop a boost (admin) — optionally noting that its money was given back. */
export async function cancelBoost(
  id: number,
  values: { reason: string; refunded: boolean },
): Promise<boolean> {
  const { data, error } = await db()
    .from('property_boosts')
    .update({
      status: 'cancelled',
      is_active: false,
      cancelled_reason: values.reason,
      refunded_at: values.refunded ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('boost_id', id)
    .in('status', ['pending', 'active'])
    .select('boost_id')
  if (error) throw new RepositoryError('Failed to cancel the boost.', error)
  return (data ?? []).length > 0
}
