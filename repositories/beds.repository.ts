import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type BedRow = Tables<'beds'>

export async function listBedsByRoom(roomId: number): Promise<BedRow[]> {
  const { data, error } = await createAdminClient()
    .from('beds')
    .select('*')
    .eq('room_id', roomId)
    .is('deleted_at', null)
    .order('bed_number')
  if (error) throw new RepositoryError('Failed to load beds.', error)
  return data ?? []
}

export async function listBedsByProperty(
  propertyId: number,
): Promise<(BedRow & { property_id: number })[]> {
  const admin = createAdminClient()
  const { data: rooms, error: rErr } = await admin
    .from('rooms')
    .select('room_id')
    .eq('property_id', propertyId)
    .is('deleted_at', null)
  if (rErr) throw new RepositoryError('Failed to load rooms.', rErr)

  const roomIds = (rooms ?? []).map((r) => r.room_id)
  if (roomIds.length === 0) return []

  const { data, error } = await admin
    .from('beds')
    .select('*')
    .in('room_id', roomIds)
    .is('deleted_at', null)
  if (error) throw new RepositoryError('Failed to load beds.', error)
  return (data ?? []).map((b) => ({ ...b, property_id: propertyId }))
}

export async function getBed(bedId: number): Promise<BedRow | null> {
  const { data, error } = await createAdminClient()
    .from('beds')
    .select('*')
    .eq('bed_id', bedId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load bed.', error)
  return data
}

export async function insertBed(values: TablesInsert<'beds'>): Promise<BedRow> {
  const { data, error } = await createAdminClient()
    .from('beds')
    .insert(values)
    .select('*')
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new RepositoryError(
        'A bed with that number already exists in this room.',
      )
    }
    throw new RepositoryError('Failed to add bed.', error)
  }
  return data
}

export async function updateBed(
  bedId: number,
  values: TablesUpdate<'beds'>,
): Promise<BedRow> {
  const { data, error } = await createAdminClient()
    .from('beds')
    .update(values)
    .eq('bed_id', bedId)
    .is('deleted_at', null)
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to update bed.', error)
  return data
}

export async function softDeleteBed(bedId: number): Promise<void> {
  const { error } = await createAdminClient()
    .from('beds')
    .update({ deleted_at: new Date().toISOString() })
    .eq('bed_id', bedId)
    .is('deleted_at', null)
  if (error) throw new RepositoryError('Failed to delete bed.', error)
}
