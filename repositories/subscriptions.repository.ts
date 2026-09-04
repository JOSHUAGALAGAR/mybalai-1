import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type PlanRow = Tables<'subscription_plans'>
export type SubscriptionRow = Tables<'landlord_subscriptions'>

/* ---- plans ---- */

export async function listPlans(
  options: { activeOnly?: boolean } = {},
): Promise<PlanRow[]> {
  let query = createAdminClient()
    .from('subscription_plans')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('plan_id', { ascending: true })
  if (options.activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw new RepositoryError('Failed to load plans.', error)
  return data ?? []
}

export async function getPlan(planId: number): Promise<PlanRow | null> {
  const { data, error } = await createAdminClient()
    .from('subscription_plans')
    .select('*')
    .eq('plan_id', planId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the plan.', error)
  return data
}

export async function getPlanByCode(code: string): Promise<PlanRow | null> {
  const { data, error } = await createAdminClient()
    .from('subscription_plans')
    .select('*')
    .eq('code', code)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the plan.', error)
  return data
}

export async function insertPlan(
  values: TablesInsert<'subscription_plans'>,
): Promise<PlanRow> {
  const { data, error } = await createAdminClient()
    .from('subscription_plans')
    .insert(values)
    .select('*')
    .single()
  if (error) throw new RepositoryError(mapWrite(error), error)
  return data
}

export async function updatePlan(
  planId: number,
  values: TablesUpdate<'subscription_plans'>,
): Promise<PlanRow> {
  const { data, error } = await createAdminClient()
    .from('subscription_plans')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('plan_id', planId)
    .select('*')
    .single()
  if (error) throw new RepositoryError(mapWrite(error), error)
  return data
}

/* ---- landlord subscriptions ---- */

export async function getSubscriptionForLandlord(
  landlordId: number,
): Promise<SubscriptionRow | null> {
  const { data, error } = await createAdminClient()
    .from('landlord_subscriptions')
    .select('*')
    .eq('landlord_id', landlordId)
    .maybeSingle()
  if (error)
    throw new RepositoryError('Failed to load the subscription.', error)
  return data
}

export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const { data, error } = await createAdminClient()
    .from('landlord_subscriptions')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load subscriptions.', error)
  return data ?? []
}

export async function upsertSubscription(
  values: TablesInsert<'landlord_subscriptions'>,
): Promise<SubscriptionRow> {
  const { data, error } = await createAdminClient()
    .from('landlord_subscriptions')
    .upsert(
      { ...values, updated_at: new Date().toISOString() },
      { onConflict: 'landlord_id' },
    )
    .select('*')
    .single()
  if (error) throw new RepositoryError(mapWrite(error), error)
  return data
}

function mapWrite(error: { code?: string; message?: string }): string {
  if (error.code === '23505') {
    return 'That code is already used by another plan.'
  }
  if (error.code === '42P01') {
    return 'The subscription tables are missing. Apply migration 0010.'
  }
  return 'The change could not be saved. Please try again.'
}
