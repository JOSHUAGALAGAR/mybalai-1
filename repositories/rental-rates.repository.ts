import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type RentalRateRow = Tables<'rental_rates'>

export async function listRatesByProperty(
  propertyId: number,
): Promise<RentalRateRow[]> {
  const { data, error } = await createAdminClient()
    .from('rental_rates')
    .select('*')
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .order('room_id')
    .order('period')
  if (error) throw new RepositoryError('Failed to load rental rates.', error)
  return data ?? []
}

export async function getRate(rateId: number): Promise<RentalRateRow | null> {
  const { data, error } = await createAdminClient()
    .from('rental_rates')
    .select('*')
    .eq('rate_id', rateId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load rental rate.', error)
  return data
}

export async function insertRate(
  values: TablesInsert<'rental_rates'>,
): Promise<RentalRateRow> {
  const { data, error } = await createAdminClient()
    .from('rental_rates')
    .insert(values)
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to create rental rate.', error)
  return data
}

export async function updateRate(
  rateId: number,
  values: TablesUpdate<'rental_rates'>,
): Promise<RentalRateRow> {
  const { data, error } = await createAdminClient()
    .from('rental_rates')
    .update(values)
    .eq('rate_id', rateId)
    .is('deleted_at', null)
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to update rental rate.', error)
  return data
}

/**
 * Rates are soft-deleted so historical bookings can still reference the price
 * that applied when they were made (spec §5.6).
 */
export async function softDeleteRate(rateId: number): Promise<void> {
  const { error } = await createAdminClient()
    .from('rental_rates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('rate_id', rateId)
    .is('deleted_at', null)
  if (error) throw new RepositoryError('Failed to delete rental rate.', error)
}
