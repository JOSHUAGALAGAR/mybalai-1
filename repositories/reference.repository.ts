import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { memoAsync } from '@/lib/utilities/memo-async'
import type { Tables } from '@/types/database'

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'RepositoryError'
  }
}

/**
 * These lookup tables (statuses, types, amenities, payment methods) are static:
 * the app never writes to them, only migrations / the Supabase dashboard do. Each
 * uncached read is a full round-trip to a database that can be ~300 ms away, and
 * most requests read several. A short TTL keeps them off the request path while
 * still picking up a dashboard edit within a minute.
 */
const REFERENCE_TTL_MS = 60_000
const copyRows = <T>(rows: T[]): T[] => [...rows]

export type AmenityWithCategory = Tables<'amenities'> & {
  category_name: string | null
}

export const listPropertyTypes = memoAsync(
  async (): Promise<Tables<'property_types'>[]> => {
    const { data, error } = await createAdminClient()
      .from('property_types')
      .select('*')
      .order('type_name')
    if (error)
      throw new RepositoryError('Failed to load property types.', error)
    return data ?? []
  },
  REFERENCE_TTL_MS,
  { copy: copyRows },
)

export const listRoomTypes = memoAsync(
  async (): Promise<Tables<'room_types'>[]> => {
    const { data, error } = await createAdminClient()
      .from('room_types')
      .select('*')
      .order('room_type_id')
    if (error) throw new RepositoryError('Failed to load room types.', error)
    return data ?? []
  },
  REFERENCE_TTL_MS,
  { copy: copyRows },
)

export const listPropertyStatuses = memoAsync(
  async (): Promise<Tables<'property_statuses'>[]> => {
    const { data, error } = await createAdminClient()
      .from('property_statuses')
      .select('*')
    if (error)
      throw new RepositoryError('Failed to load property statuses.', error)
    return data ?? []
  },
  REFERENCE_TTL_MS,
  { copy: copyRows },
)

export const listRoomStatuses = memoAsync(
  async (): Promise<Tables<'room_statuses'>[]> => {
    const { data, error } = await createAdminClient()
      .from('room_statuses')
      .select('*')
    if (error) throw new RepositoryError('Failed to load room statuses.', error)
    return data ?? []
  },
  REFERENCE_TTL_MS,
  { copy: copyRows },
)

export const listBedStatuses = memoAsync(
  async (): Promise<Tables<'bed_statuses'>[]> => {
    const { data, error } = await createAdminClient()
      .from('bed_statuses')
      .select('*')
    if (error) throw new RepositoryError('Failed to load bed statuses.', error)
    return data ?? []
  },
  REFERENCE_TTL_MS,
  { copy: copyRows },
)

export const listBookingStatuses = memoAsync(
  async (): Promise<Tables<'booking_statuses'>[]> => {
    const { data, error } = await createAdminClient()
      .from('booking_statuses')
      .select('*')
    if (error)
      throw new RepositoryError('Failed to load booking statuses.', error)
    return data ?? []
  },
  REFERENCE_TTL_MS,
  { copy: copyRows },
)

export const listPaymentMethods = memoAsync(
  async (): Promise<Tables<'payment_methods'>[]> => {
    const { data, error } = await createAdminClient()
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('payment_method_id')
    if (error)
      throw new RepositoryError('Failed to load payment methods.', error)
    return data ?? []
  },
  REFERENCE_TTL_MS,
  { copy: copyRows },
)

export const listPaymentStatuses = memoAsync(
  async (): Promise<Tables<'payment_statuses'>[]> => {
    const { data, error } = await createAdminClient()
      .from('payment_statuses')
      .select('*')
    if (error)
      throw new RepositoryError('Failed to load payment statuses.', error)
    return data ?? []
  },
  REFERENCE_TTL_MS,
  { copy: copyRows },
)

export type StatusTable = 'property_statuses' | 'room_statuses' | 'bed_statuses'

export async function resolveStatusId(
  table: StatusTable,
  statusCode: string,
): Promise<number> {
  const admin = createAdminClient()

  if (table === 'property_statuses') {
    const { data, error } = await admin
      .from('property_statuses')
      .select('property_status_id')
      .eq('status_code', statusCode)
      .maybeSingle()
    if (error) throw new RepositoryError('Failed to resolve status.', error)
    if (!data)
      throw new RepositoryError(`Status "${statusCode}" is not configured.`)
    return data.property_status_id
  }

  if (table === 'room_statuses') {
    const { data, error } = await admin
      .from('room_statuses')
      .select('room_status_id')
      .eq('status_code', statusCode)
      .maybeSingle()
    if (error) throw new RepositoryError('Failed to resolve status.', error)
    if (!data)
      throw new RepositoryError(`Status "${statusCode}" is not configured.`)
    return data.room_status_id
  }

  const { data, error } = await admin
    .from('bed_statuses')
    .select('bed_status_id')
    .eq('status_code', statusCode)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to resolve status.', error)
  if (!data)
    throw new RepositoryError(`Status "${statusCode}" is not configured.`)
  return data.bed_status_id
}

export const listAmenities = memoAsync(
  async (): Promise<AmenityWithCategory[]> => {
    const admin = createAdminClient()
    const [{ data: amenities, error: aErr }, { data: cats, error: cErr }] =
      await Promise.all([
        admin
          .from('amenities')
          .select('*')
          .eq('is_active', true)
          .order('amenity_name'),
        admin.from('amenity_categories').select('*'),
      ])
    if (aErr) throw new RepositoryError('Failed to load amenities.', aErr)
    if (cErr)
      throw new RepositoryError('Failed to load amenity categories.', cErr)

    const catName = new Map(
      (cats ?? []).map(
        (c) => [c.amenity_category_id, c.category_name] as const,
      ),
    )
    return (amenities ?? []).map((a) => ({
      ...a,
      category_name:
        a.amenity_category_id != null
          ? (catName.get(a.amenity_category_id) ?? null)
          : null,
    }))
  },
  REFERENCE_TTL_MS,
  { copy: copyRows },
)
