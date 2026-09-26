import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type FeeSettingsRow = Tables<'platform_fee_settings'>
export type PayoutSettingsRow = Tables<'payout_settings'>
export type EarningRow = Tables<'landlord_earnings'>
export type PayoutRow = Tables<'payouts'>
export type MethodRow = Tables<'withdrawal_methods'>

const db = () => createAdminClient()

/* ---- settings (one active row each) ---- */

export async function getFeeSettings(): Promise<FeeSettingsRow | null> {
  const { data, error } = await db()
    .from('platform_fee_settings')
    .select('*')
    .eq('is_active', true)
    .order('fee_setting_id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load fee settings.', error)
  return data
}

export async function getPayoutSettings(): Promise<PayoutSettingsRow | null> {
  const { data, error } = await db()
    .from('payout_settings')
    .select('*')
    .eq('is_active', true)
    .order('payout_setting_id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load payout settings.', error)
  return data
}

export async function saveFeeSettings(
  existing: FeeSettingsRow | null,
  values: { fee_value: number; paymongo_fee_rate: number; updated_by: number },
): Promise<void> {
  const q = existing
    ? db()
        .from('platform_fee_settings')
        .update({ ...values, fee_type: 'percentage' })
        .eq('fee_setting_id', existing.fee_setting_id)
    : db()
        .from('platform_fee_settings')
        .insert({ ...values, fee_type: 'percentage' })
  const { error } = await q
  if (error)
    throw new RepositoryError('Failed to save the fee settings.', error)
}

export async function savePayoutSettings(
  existing: PayoutSettingsRow | null,
  values: {
    payout_day_1: number
    minimum_threshold: number
    settlement_period_days: number
    updated_by: number
  },
): Promise<void> {
  const row = { ...values, payout_day_2: null, frequency: 'monthly' }
  const q = existing
    ? db()
        .from('payout_settings')
        .update(row)
        .eq('payout_setting_id', existing.payout_setting_id)
    : db().from('payout_settings').insert(row)
  const { error } = await q
  if (error)
    throw new RepositoryError('Failed to save the payout settings.', error)
}

/* ---- earnings ---- */

export async function listEarnings(landlordId: number): Promise<EarningRow[]> {
  const { data, error } = await db()
    .from('landlord_earnings')
    .select('*')
    .eq('landlord_id', landlordId)
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load earnings.', error)
  return data ?? []
}

/** Put the earnings of a payout back in the pool (a failed payout): the landlord can ask again. */
export async function releaseEarnings(payoutId: number): Promise<void> {
  const { error } = await db()
    .from('landlord_earnings')
    .update({
      payout_id: null,
      status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('payout_id', payoutId)
  if (error) throw new RepositoryError('Failed to release the earnings.', error)
}

export async function markEarningsPaidOut(payoutId: number): Promise<void> {
  const { error } = await db()
    .from('landlord_earnings')
    .update({ status: 'paid_out', updated_at: new Date().toISOString() })
    .eq('payout_id', payoutId)
  if (error) throw new RepositoryError('Failed to update the earnings.', error)
}

/* ---- withdrawal method ---- */

export async function getActiveMethod(
  landlordId: number,
): Promise<MethodRow | null> {
  const { data, error } = await db()
    .from('withdrawal_methods')
    .select('*')
    .eq('landlord_id', landlordId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('withdrawal_method_id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error)
    throw new RepositoryError('Failed to load the withdrawal method.', error)
  return data
}

export async function getMethod(id: number): Promise<MethodRow | null> {
  const { data, error } = await db()
    .from('withdrawal_methods')
    .select('*')
    .eq('withdrawal_method_id', id)
    .maybeSingle()
  if (error)
    throw new RepositoryError('Failed to load the withdrawal method.', error)
  return data
}

/** One method at a time: the new one replaces the old (old payouts keep pointing at theirs). */
export async function replaceMethod(
  landlordId: number,
  values: {
    method_type: string
    account_name: string
    masked_account_number: string
    provider_reference: string
  },
): Promise<MethodRow> {
  const off = await db()
    .from('withdrawal_methods')
    .update({
      is_active: false,
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq('landlord_id', landlordId)
    .eq('is_active', true)
  if (off.error)
    throw new RepositoryError(
      'Failed to update the withdrawal method.',
      off.error,
    )
  const { data, error } = await db()
    .from('withdrawal_methods')
    .insert({
      landlord_id: landlordId,
      ...values,
      is_active: true,
      is_default: true,
    })
    .select('*')
    .single()
  if (error || !data)
    throw new RepositoryError('Failed to save the withdrawal method.', error)
  return data
}

/* ---- payouts ---- */

export async function listPayoutsByLandlord(
  landlordId: number,
): Promise<PayoutRow[]> {
  const { data, error } = await db()
    .from('payouts')
    .select('*')
    .eq('landlord_id', landlordId)
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load withdrawals.', error)
  return data ?? []
}

export async function listPayouts(status?: string): Promise<PayoutRow[]> {
  let q = db()
    .from('payouts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw new RepositoryError('Failed to load withdrawals.', error)
  return data ?? []
}

export async function getPayout(id: number): Promise<PayoutRow | null> {
  const { data, error } = await db()
    .from('payouts')
    .select('*')
    .eq('payout_id', id)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the withdrawal.', error)
  return data
}

/** Atomic: claims every withdrawable earning into one payout, or raises `below_threshold` / `payout_open`. */
export async function callRequestPayout(
  landlordId: number,
  methodId: number,
): Promise<number> {
  const { data, error } = await db().rpc('request_landlord_payout', {
    p_landlord: landlordId,
    p_method: methodId,
  })
  if (error) throw new RepositoryError(error.message, error)
  return Number(data)
}

/**
 * Move a payout out of `pending`/`processing` — only if it still is (two admins clicking at
 * once: the second loses cleanly). Returns false when someone else already decided.
 */
export async function decidePayout(
  id: number,
  patch: Partial<
    Pick<
      PayoutRow,
      | 'status'
      | 'completed_at'
      | 'failed_at'
      | 'failure_reason'
      | 'provider_payout_id'
      | 'provider'
    >
  >,
): Promise<boolean> {
  const { data, error } = await db()
    .from('payouts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('payout_id', id)
    .in('status', ['pending', 'processing'])
    .select('payout_id')
  if (error)
    throw new RepositoryError('Failed to update the withdrawal.', error)
  return (data ?? []).length > 0
}
