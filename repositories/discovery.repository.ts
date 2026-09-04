import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type PropertyRow = Tables<'properties'>
export type RoomRow = Tables<'rooms'>
export type BedRow = Tables<'beds'>
export type RateRow = Tables<'rental_rates'>
export type RatingRow = Tables<'property_ratings'>

/** Active, non-deleted properties, optionally name/address filtered by `q`. */
export async function listVisibleProperties(options: {
  q?: string
  typeId?: number
}): Promise<PropertyRow[]> {
  const admin = createAdminClient()

  const { data: statusRow, error: statusErr } = await admin
    .from('property_statuses')
    .select('property_status_id')
    .eq('status_code', 'active')
    .maybeSingle()
  if (statusErr)
    throw new RepositoryError('Failed to resolve status.', statusErr)
  if (!statusRow) return []

  let query = admin
    .from('properties')
    .select('*')
    .is('deleted_at', null)
    .eq('status_id', statusRow.property_status_id)

  if (options.typeId) query = query.eq('property_type_id', options.typeId)
  if (options.q) {
    const like = `%${options.q.replace(/[%_]/g, (m) => `\\${m}`)}%`
    query = query.or(`property_name.ilike.${like},address.ilike.${like}`)
  }

  const { data, error } = await query
  if (error) throw new RepositoryError('Failed to load properties.', error)
  return data ?? []
}

export async function getVisibleProperty(
  propertyId: number,
): Promise<PropertyRow | null> {
  const admin = createAdminClient()
  const { data: statusRow } = await admin
    .from('property_statuses')
    .select('property_status_id')
    .eq('status_code', 'active')
    .maybeSingle()

  const { data, error } = await admin
    .from('properties')
    .select('*')
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load property.', error)
  if (!data) return null
  if (statusRow && data.status_id !== statusRow.property_status_id) return null
  return data
}

export async function listActiveRates(
  propertyIds: number[],
): Promise<RateRow[]> {
  if (propertyIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('rental_rates')
    .select('*')
    .in('property_id', propertyIds)
    .is('deleted_at', null)
  if (error) throw new RepositoryError('Failed to load rental rates.', error)
  return data ?? []
}

export async function listAmenityLinks(
  propertyIds: number[],
): Promise<{ property_id: number; amenity_id: number }[]> {
  if (propertyIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('property_amenities')
    .select('property_id, amenity_id')
    .in('property_id', propertyIds)
  if (error) throw new RepositoryError('Failed to load amenities.', error)
  return data ?? []
}

export async function listRoomsForProperty(
  propertyId: number,
): Promise<RoomRow[]> {
  const { data, error } = await createAdminClient()
    .from('rooms')
    .select('*')
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .order('room_id')
  if (error) throw new RepositoryError('Failed to load rooms.', error)
  return data ?? []
}

export async function listBedsForRooms(roomIds: number[]): Promise<BedRow[]> {
  if (roomIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('beds')
    .select('*')
    .in('room_id', roomIds)
    .is('deleted_at', null)
  if (error) throw new RepositoryError('Failed to load beds.', error)
  return data ?? []
}

export async function listRatings(propertyIds: number[]): Promise<RatingRow[]> {
  if (propertyIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('property_ratings')
    .select('*')
    .in('property_id', propertyIds)
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load ratings.', error)
  return data ?? []
}

export async function reviewerNames(
  userIds: number[],
): Promise<Map<number, string | null>> {
  if (userIds.length === 0) return new Map()
  const { data, error } = await createAdminClient()
    .from('user_accounts')
    .select('legacy_user_id, full_name')
    .in('legacy_user_id', [...new Set(userIds)])
  if (error) throw new RepositoryError('Failed to load reviewers.', error)
  return new Map((data ?? []).map((r) => [r.legacy_user_id, r.full_name]))
}
