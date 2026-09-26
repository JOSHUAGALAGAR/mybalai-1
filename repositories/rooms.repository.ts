import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type RoomRow = Tables<'rooms'>

export async function listRoomsByProperty(
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

export async function getRoom(roomId: number): Promise<RoomRow | null> {
  const { data, error } = await createAdminClient()
    .from('rooms')
    .select('*')
    .eq('room_id', roomId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load room.', error)
  return data
}

export async function insertRoom(
  values: TablesInsert<'rooms'>,
): Promise<RoomRow> {
  const { data, error } = await createAdminClient()
    .from('rooms')
    .insert(values)
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to create room.', error)
  return data
}

export async function updateRoom(
  roomId: number,
  values: TablesUpdate<'rooms'>,
): Promise<RoomRow> {
  const { data, error } = await createAdminClient()
    .from('rooms')
    .update(values)
    .eq('room_id', roomId)
    .is('deleted_at', null)
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to update room.', error)
  return data
}

export async function softDeleteRoom(roomId: number): Promise<void> {
  const { error } = await createAdminClient()
    .from('rooms')
    .update({ deleted_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .is('deleted_at', null)
  if (error) throw new RepositoryError('Failed to delete room.', error)
}

/** Many rooms in one request. */
export async function insertRooms(
  values: TablesInsert<'rooms'>[],
): Promise<RoomRow[]> {
  const { data, error } = await createAdminClient()
    .from('rooms')
    // rows omit switches that are off: let the database default them (not NULL)
    .insert(values, { defaultToNull: false })
    .select('*')
  if (error) throw new RepositoryError('Failed to create rooms.', error)
  return data ?? []
}

export async function softDeleteRooms(roomIds: number[]): Promise<void> {
  if (roomIds.length === 0) return
  const { error } = await createAdminClient()
    .from('rooms')
    .update({ deleted_at: new Date().toISOString() })
    .in('room_id', roomIds)
  if (error) throw new RepositoryError('Failed to remove rooms.', error)
}

/** How many (non-deleted) rooms each property has, for several properties in one query. */
export async function countRoomsByProperties(
  propertyIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
  if (propertyIds.length === 0) return counts
  const { data, error } = await createAdminClient()
    .from('rooms')
    .select('property_id')
    .in('property_id', [...new Set(propertyIds)])
    .is('deleted_at', null)
  if (error) throw new RepositoryError('Failed to count rooms.', error)
  for (const row of data ?? []) {
    counts.set(row.property_id, (counts.get(row.property_id) ?? 0) + 1)
  }
  return counts
}
