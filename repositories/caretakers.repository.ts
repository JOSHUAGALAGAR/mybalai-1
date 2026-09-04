import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type AssignmentRow = Tables<'caretaker_property_assignments'>

/** Distinct caretaker ids this landlord has ever assigned (via assigned_by). */
export async function listCaretakerIdsForLandlord(
  landlordId: number,
): Promise<number[]> {
  const { data, error } = await createAdminClient()
    .from('caretaker_property_assignments')
    .select('caretaker_id')
    .eq('assigned_by', landlordId)
  if (error) throw new RepositoryError('Failed to load caretakers.', error)
  return [...new Set((data ?? []).map((r) => r.caretaker_id))]
}

export async function listAssignmentsForLandlord(
  landlordId: number,
): Promise<AssignmentRow[]> {
  const { data, error } = await createAdminClient()
    .from('caretaker_property_assignments')
    .select('*')
    .eq('assigned_by', landlordId)
  if (error) throw new RepositoryError('Failed to load assignments.', error)
  return data ?? []
}

export async function listAssignmentsForCaretaker(
  caretakerId: number,
): Promise<AssignmentRow[]> {
  const { data, error } = await createAdminClient()
    .from('caretaker_property_assignments')
    .select('*')
    .eq('caretaker_id', caretakerId)
  if (error) throw new RepositoryError('Failed to load assignments.', error)
  return data ?? []
}

export async function listAssignedPropertyIds(
  caretakerId: number,
  options: { activeOnly?: boolean } = { activeOnly: true },
): Promise<number[]> {
  let query = createAdminClient()
    .from('caretaker_property_assignments')
    .select('property_id, is_active')
    .eq('caretaker_id', caretakerId)
  if (options.activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw new RepositoryError('Failed to load assignments.', error)
  return (data ?? []).map((r) => r.property_id)
}

export async function isPropertyAssigned(
  caretakerId: number,
  propertyId: number,
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('caretaker_property_assignments')
    .select('assignment_id')
    .eq('caretaker_id', caretakerId)
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to check assignment.', error)
  return data != null
}

/**
 * Reconcile assignments for `caretakerId` across `landlordPropertyIds`
 * (the landlord's own properties only): every id in `keepActive` becomes an
 * active row (inserting if needed), the rest become inactive.
 */
export async function reconcileAssignments(params: {
  caretakerId: number
  assignedBy: number
  landlordPropertyIds: number[]
  keepActive: number[]
}): Promise<void> {
  const { caretakerId, assignedBy, landlordPropertyIds, keepActive } = params
  const admin = createAdminClient()
  const keep = new Set(
    keepActive.filter((id) => landlordPropertyIds.includes(id)),
  )
  const nowIso = new Date().toISOString()

  const { data: existing, error } = await admin
    .from('caretaker_property_assignments')
    .select('assignment_id, property_id, is_active')
    .eq('caretaker_id', caretakerId)
    .in('property_id', landlordPropertyIds.length ? landlordPropertyIds : [-1])
  if (error) throw new RepositoryError('Failed to load assignments.', error)

  const existingByProp = new Map(
    (existing ?? []).map((r) => [r.property_id, r] as const),
  )

  for (const propertyId of landlordPropertyIds) {
    const shouldBeActive = keep.has(propertyId)
    const row = existingByProp.get(propertyId)

    if (!row && shouldBeActive) {
      const { error: insErr } = await admin
        .from('caretaker_property_assignments')
        .insert({
          caretaker_id: caretakerId,
          property_id: propertyId,
          assigned_by: assignedBy,
          is_active: true,
        })
      if (insErr)
        throw new RepositoryError('Failed to assign property.', insErr)
    } else if (row && row.is_active !== shouldBeActive) {
      const patch = shouldBeActive
        ? {
            is_active: true,
            assigned_by: assignedBy,
            assigned_at: nowIso,
            unassigned_at: null,
          }
        : { is_active: false, unassigned_at: nowIso }
      const { error: updErr } = await admin
        .from('caretaker_property_assignments')
        .update(patch)
        .eq('assignment_id', row.assignment_id)
      if (updErr)
        throw new RepositoryError('Failed to update assignment.', updErr)
    }
  }
}
