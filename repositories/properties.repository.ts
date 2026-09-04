import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type PropertyRow = Tables<'properties'>

export async function listProperties(
  options: { ownerId?: number } = {},
): Promise<PropertyRow[]> {
  let query = createAdminClient()
    .from('properties')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (options.ownerId !== undefined) {
    query = query.eq('property_owner', options.ownerId)
  }

  const { data, error } = await query
  if (error) throw new RepositoryError('Failed to load properties.', error)
  return data ?? []
}

export async function listPropertiesByIds(
  ids: number[],
): Promise<PropertyRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('properties')
    .select('*')
    .in('property_id', ids)
    .is('deleted_at', null)
    .order('property_name')
  if (error) throw new RepositoryError('Failed to load properties.', error)
  return data ?? []
}

export async function getProperty(
  propertyId: number,
): Promise<PropertyRow | null> {
  const { data, error } = await createAdminClient()
    .from('properties')
    .select('*')
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load property.', error)
  return data
}

export async function insertProperty(
  values: TablesInsert<'properties'>,
): Promise<PropertyRow> {
  const { data, error } = await createAdminClient()
    .from('properties')
    .insert(values)
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to create property.', error)
  return data
}

export async function updateProperty(
  propertyId: number,
  values: TablesUpdate<'properties'>,
): Promise<PropertyRow> {
  const { data, error } = await createAdminClient()
    .from('properties')
    .update(values)
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to update property.', error)
  return data
}

export async function softDeleteProperty(propertyId: number): Promise<void> {
  const { error } = await createAdminClient()
    .from('properties')
    .update({ deleted_at: new Date().toISOString() })
    .eq('property_id', propertyId)
    .is('deleted_at', null)
  if (error) throw new RepositoryError('Failed to archive property.', error)
}

/* ---- amenities ---- */

export async function getPropertyAmenityIds(
  propertyId: number,
): Promise<number[]> {
  const { data, error } = await createAdminClient()
    .from('property_amenities')
    .select('amenity_id')
    .eq('property_id', propertyId)
  if (error)
    throw new RepositoryError('Failed to load property amenities.', error)
  return (data ?? []).map((r) => r.amenity_id)
}

export async function setPropertyAmenities(
  propertyId: number,
  amenityIds: number[],
): Promise<void> {
  const admin = createAdminClient()

  const { error: delError } = await admin
    .from('property_amenities')
    .delete()
    .eq('property_id', propertyId)
  if (delError) {
    throw new RepositoryError('Failed to update property amenities.', delError)
  }

  if (amenityIds.length === 0) return

  const rows: TablesInsert<'property_amenities'>[] = amenityIds.map((id) => ({
    property_id: propertyId,
    amenity_id: id,
  }))
  const { error: insError } = await admin
    .from('property_amenities')
    .insert(rows)
  if (insError) {
    throw new RepositoryError('Failed to update property amenities.', insError)
  }
}
