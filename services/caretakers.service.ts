import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireArea } from '@/lib/auth/dal'
import * as bedsRepo from '@/repositories/beds.repository'
import * as caretakersRepo from '@/repositories/caretakers.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import * as usersRepo from '@/repositories/users.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import { requireOperableProperty } from '@/services/property-access'
import * as subscriptions from '@/services/subscriptions.service'
import { assignmentsSchema, createCaretakerSchema } from '@/schemas/caretaker'

export type CaretakerSummary = {
  legacyUserId: number
  fullName: string | null
  email: string | null
  isActive: boolean
  activeAssignments: number
  totalAssignments: number
}

async function assertIsCaretaker(legacyUserId: number): Promise<void> {
  const roles = await usersRepo.getRoleCodes(legacyUserId)
  if (!roles.includes('caretaker')) {
    throw new ServiceError('That account is not a caretaker.', 'validation')
  }
}

export async function createCaretaker(input: unknown): Promise<{
  legacyUserId: number
}> {
  const actor = await requireArea('landlord', 'superadmin')
  const data = parseOrThrow(createCaretakerSchema, input)

  if (!actor.roles.includes('superadmin')) {
    await subscriptions.assertCanAddCaretaker(actor.legacyUserId)
  }

  const existing = await usersRepo.getAccountByEmail(data.email)
  if (existing) {
    throw new ServiceError(
      'An account with that email already exists.',
      'conflict',
      { email: ['This email is already in use.'] },
    )
  }

  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { full_name: data.fullName, role: 'caretaker' },
  })

  if (error || !created.user) {
    if (
      error &&
      /already been registered|already exists/i.test(error.message)
    ) {
      throw new ServiceError(
        'An account with that email already exists.',
        'conflict',
        { email: ['This email is already in use.'] },
      )
    }
    throw new ServiceError(
      'Could not create the caretaker account. Please try again.',
      'unknown',
    )
  }

  // The `handle_new_user` trigger provisions user_accounts + user_roles.
  const account = await usersRepo.getAccountByAuthId(created.user.id)
  if (!account) {
    throw new ServiceError(
      'The caretaker sign-in was created but the profile was not provisioned. Apply migration 0003 and try again.',
      'unknown',
    )
  }

  // The caretaker appears in this landlord's list once a property is assigned;
  // the create flow redirects straight to the assignment screen.
  return { legacyUserId: account.legacy_user_id }
}

export async function listMyCaretakers(): Promise<CaretakerSummary[]> {
  const actor = await requireArea('landlord', 'superadmin')
  const [ids, assignments] = await Promise.all([
    caretakersRepo.listCaretakerIdsForLandlord(actor.legacyUserId),
    caretakersRepo.listAssignmentsForLandlord(actor.legacyUserId),
  ])
  if (ids.length === 0) return []

  const counts = new Map<number, { active: number; total: number }>()
  for (const a of assignments) {
    const c = counts.get(a.caretaker_id) ?? { active: 0, total: 0 }
    c.total += 1
    if (a.is_active) c.active += 1
    counts.set(a.caretaker_id, c)
  }

  const accounts = await Promise.all(
    ids.map((id) => usersRepo.getAccountById(id)),
  )
  return accounts
    .filter((a): a is NonNullable<typeof a> => a != null)
    .map((a) => ({
      legacyUserId: a.legacy_user_id,
      fullName: a.full_name,
      email: a.email,
      isActive: a.is_active,
      activeAssignments: counts.get(a.legacy_user_id)?.active ?? 0,
      totalAssignments: counts.get(a.legacy_user_id)?.total ?? 0,
    }))
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''))
}

export async function getCaretakerDetail(caretakerId: number) {
  const actor = await requireArea('landlord', 'superadmin')

  const account = await usersRepo.getAccountById(caretakerId)
  if (!account) {
    throw new ServiceError('Caretaker not found.', 'not_found')
  }
  await assertIsCaretaker(caretakerId)

  const [myProperties, assignments] = await Promise.all([
    propertiesRepo.listProperties({ ownerId: actor.legacyUserId }),
    caretakersRepo.listAssignmentsForCaretaker(caretakerId),
  ])

  const activeAssignedIds = new Set(
    assignments.filter((a) => a.is_active).map((a) => a.property_id),
  )

  return {
    account: {
      legacyUserId: account.legacy_user_id,
      fullName: account.full_name,
      email: account.email,
      isActive: account.is_active,
    },
    properties: myProperties.map((p) => ({
      property_id: p.property_id,
      property_name: p.property_name,
      address: p.address,
      assigned: activeAssignedIds.has(p.property_id),
    })),
  }
}

export async function updateAssignments(
  caretakerId: number,
  input: unknown,
): Promise<void> {
  const actor = await requireArea('landlord', 'superadmin')

  const account = await usersRepo.getAccountById(caretakerId)
  if (!account) throw new ServiceError('Caretaker not found.', 'not_found')
  await assertIsCaretaker(caretakerId)

  const { property_ids } = parseOrThrow(assignmentsSchema, input)

  const myProperties = await propertiesRepo.listProperties({
    ownerId: actor.legacyUserId,
  })
  const landlordPropertyIds = myProperties.map((p) => p.property_id)

  await caretakersRepo.reconcileAssignments({
    caretakerId,
    assignedBy: actor.legacyUserId,
    landlordPropertyIds,
    keepActive: property_ids,
  })
}

/* ---- caretaker's own view ---- */

export async function listMyAssignedProperties() {
  const user = await requireArea('caretaker', 'superadmin')
  const ids = await caretakersRepo.listAssignedPropertyIds(user.legacyUserId, {
    activeOnly: true,
  })
  return propertiesRepo.listPropertiesByIds(ids)
}

export async function getAssignedPropertyDetail(propertyId: number) {
  await requireArea('caretaker', 'superadmin')
  const { property } = await requireOperableProperty(propertyId)
  const rooms = await roomsRepo.listRoomsByProperty(propertyId)
  const beds = await bedsRepo.listBedsByProperty(propertyId)
  return { property, rooms, beds }
}
