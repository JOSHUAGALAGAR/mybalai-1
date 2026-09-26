import 'server-only'

import { invalidateCurrentUser, requireRole } from '@/lib/auth/dal'
import { createAdminClient } from '@/lib/supabase/admin'
import { temporaryPassword } from '@/lib/temporary-password'
import * as boostsRepo from '@/repositories/boosts.repository'
import { createLandlordSchema } from '@/schemas/landlord'
import * as usersRepo from '@/repositories/users.repository'
import * as adminRepo from '@/repositories/admin.repository'
import * as discoveryRepo from '@/repositories/discovery.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import { recordAudit } from '@/services/audit.service'
import {
  setPropertyFlagsSchema,
  setPropertyStatusSchema,
  setUserActiveSchema,
} from '@/schemas/admin'

/* ------------------------------------------------------------------ *
 * Property listings — read-only oversight for the superadmin
 * ------------------------------------------------------------------ */

export type AdminPropertyListItem = {
  propertyId: number
  name: string
  address: string
  ownerName: string
  ownerBusiness: string | null
  typeName: string | null
  statusCode: string | null
  statusName: string | null
  isVerified: boolean
  isFeatured: boolean
  createdAt: string
}

function ownerLabel(
  owner: adminRepo.OwnerSummary | undefined,
  ownerId: number | null,
): string {
  if (!owner) return ownerId != null ? `User #${ownerId}` : 'Unassigned'
  return owner.fullName || owner.email || `User #${owner.legacyUserId}`
}

export type ListingOverview = {
  total: number
  byStatus: { code: string; name: string; count: number }[]
  pending: number
}

export async function getListingOverview(): Promise<ListingOverview> {
  await requireRole('superadmin')
  const [rows, statuses] = await Promise.all([
    adminRepo.listAllProperties(),
    referenceRepo.listPropertyStatuses(),
  ])
  const count = new Map<number, number>()
  for (const r of rows) {
    if (r.status_id == null) continue
    count.set(r.status_id, (count.get(r.status_id) ?? 0) + 1)
  }
  const byStatus = statuses.map((s) => ({
    code: s.status_code,
    name: s.status_name,
    count: count.get(s.property_status_id) ?? 0,
  }))
  return {
    total: rows.length,
    byStatus,
    pending: byStatus.find((s) => s.code === 'pending')?.count ?? 0,
  }
}

export async function listAdminProperties(
  statusCode?: string,
): Promise<AdminPropertyListItem[]> {
  await requireRole('superadmin')

  const [rows, statuses, types] = await Promise.all([
    adminRepo.listAllProperties(),
    referenceRepo.listPropertyStatuses(),
    referenceRepo.listPropertyTypes(),
  ])

  const statusById = new Map(
    statuses.map((s) => [
      s.property_status_id,
      { code: s.status_code, name: s.status_name },
    ]),
  )
  const typeName = new Map(types.map((t) => [t.property_type_id, t.type_name]))
  const owners = await adminRepo.ownerSummariesByIds(
    rows.map((r) => r.property_owner).filter((id): id is number => id != null),
  )

  const filtered = statusCode
    ? rows.filter(
        (r) =>
          r.status_id != null &&
          statusById.get(r.status_id)?.code === statusCode,
      )
    : rows

  return filtered.map((r) => {
    const st = r.status_id ? statusById.get(r.status_id) : undefined
    const owner =
      r.property_owner != null ? owners.get(r.property_owner) : undefined
    return {
      propertyId: r.property_id,
      name: r.property_name,
      address: r.address,
      ownerName: ownerLabel(owner, r.property_owner),
      ownerBusiness: owner?.businessName ?? null,
      typeName:
        r.property_type_id != null
          ? (typeName.get(r.property_type_id) ?? null)
          : null,
      statusCode: st?.code ?? null,
      statusName: st?.name ?? null,
      isVerified: r.is_verified,
      isFeatured: r.is_featured,
      createdAt: r.created_at,
    }
  })
}

export type AdminPropertyDetail = {
  property: adminRepo.PropertyRow
  statusCode: string | null
  statusName: string | null
  typeName: string | null
  owner: adminRepo.OwnerSummary | null
  ownerName: string
  rooms: {
    roomId: number
    label: string
    bedCount: number
    rates: { period: string; price: number }[]
  }[]
  amenities: string[]
  ratings: { avg: number | null; count: number }
}

export async function getAdminProperty(
  propertyId: number,
): Promise<AdminPropertyDetail> {
  await requireRole('superadmin')

  const property = await discoveryRepo
    .getVisibleProperty(propertyId)
    .catch(() => null)
  // getVisibleProperty hides non-active listings; the admin must see every
  // status, so fall back to a direct read.
  const row =
    property ??
    (await adminRepo
      .listAllProperties()
      .then((all) => all.find((p) => p.property_id === propertyId) ?? null))
  if (!row) throw new ServiceError('Property not found.', 'not_found')

  const [statuses, types, rooms, rates, amenityLinks, amenityCatalog, ratings] =
    await Promise.all([
      referenceRepo.listPropertyStatuses(),
      referenceRepo.listPropertyTypes(),
      discoveryRepo.listRoomsForProperty(propertyId),
      discoveryRepo.listActiveRates([propertyId]),
      discoveryRepo.listAmenityLinks([propertyId]),
      referenceRepo.listAmenities(),
      discoveryRepo.listRatings([propertyId]),
    ])

  const beds = await discoveryRepo.listBedsForRooms(rooms.map((r) => r.room_id))
  const owners = await adminRepo.ownerSummariesByIds(
    row.property_owner != null ? [row.property_owner] : [],
  )
  const owner =
    row.property_owner != null ? (owners.get(row.property_owner) ?? null) : null

  const bedCountByRoom = new Map<number, number>()
  for (const b of beds) {
    bedCountByRoom.set(b.room_id, (bedCountByRoom.get(b.room_id) ?? 0) + 1)
  }
  const ratesByRoom = new Map<number, { period: string; price: number }[]>()
  for (const r of rates) {
    const list = ratesByRoom.get(r.room_id) ?? []
    list.push({ period: r.period, price: Number(r.price) })
    ratesByRoom.set(r.room_id, list)
  }

  const selectedAmenityIds = new Set(amenityLinks.map((l) => l.amenity_id))
  const amenities = amenityCatalog
    .filter((a) => selectedAmenityIds.has(a.amenity_id))
    .map((a) => a.amenity_name)
    .sort()

  const sum = ratings.reduce((n, r) => n + r.rating, 0)
  const statusRow =
    row.status_id != null
      ? (statuses.find((s) => s.property_status_id === row.status_id) ?? null)
      : null

  return {
    property: row,
    statusCode: statusRow?.status_code ?? null,
    statusName: statusRow?.status_name ?? null,
    typeName:
      row.property_type_id != null
        ? (types.find((t) => t.property_type_id === row.property_type_id)
            ?.type_name ?? null)
        : null,
    owner,
    ownerName: ownerLabel(owner ?? undefined, row.property_owner),
    rooms: rooms.map((room) => ({
      roomId: room.room_id,
      label:
        room.room_name || room.room_number
          ? [room.room_name, room.room_number].filter(Boolean).join(' · ')
          : `Room #${room.room_id}`,
      bedCount: bedCountByRoom.get(room.room_id) ?? 0,
      rates: ratesByRoom.get(room.room_id) ?? [],
    })),
    amenities,
    ratings: {
      avg: ratings.length ? Math.round((sum / ratings.length) * 10) / 10 : null,
      count: ratings.length,
    },
  }
}

/* ------------------------------------------------------------------ *
 * Property review — superadmin mutations (spec §38)
 * ------------------------------------------------------------------ */

export async function setPropertyStatus(
  propertyId: number,
  input: unknown,
): Promise<void> {
  const actor = await requireRole('superadmin')
  const { status_code } = parseOrThrow(setPropertyStatusSchema, input)
  const property = await propertiesRepo.getProperty(propertyId)
  if (!property) throw new ServiceError('Property not found.', 'not_found')

  const statusId = await referenceRepo.resolveStatusId(
    'property_statuses',
    status_code,
  )
  await propertiesRepo.updateProperty(propertyId, { status_id: statusId })
  await recordAudit({
    actor,
    action: 'property.status_changed',
    targetType: 'property',
    targetId: propertyId,
    summary: `Set listing #${propertyId}${property.property_name ? ` (${property.property_name})` : ''} to ${status_code}`,
    details: { status: status_code },
  })
}

export async function setPropertyFlags(
  propertyId: number,
  input: unknown,
): Promise<void> {
  const actor = await requireRole('superadmin')
  const { is_verified, is_featured } = parseOrThrow(
    setPropertyFlagsSchema,
    input,
  )
  const property = await propertiesRepo.getProperty(propertyId)
  if (!property) throw new ServiceError('Property not found.', 'not_found')

  await propertiesRepo.updateProperty(propertyId, {
    is_verified,
    is_featured,
  })
  await recordAudit({
    actor,
    action: 'property.flags_changed',
    targetType: 'property',
    targetId: propertyId,
    summary: `Listing #${propertyId}${property.property_name ? ` (${property.property_name})` : ''}: verified ${is_verified ? 'on' : 'off'}, featured ${is_featured ? 'on' : 'off'}`,
    details: { is_verified, is_featured },
  })
}

/* ------------------------------------------------------------------ *
 * Users — superadmin management
 * ------------------------------------------------------------------ */

export async function listUsers(
  query?: string,
): Promise<adminRepo.AdminUserRow[]> {
  await requireRole('superadmin')
  return adminRepo.listAllUsers(query?.trim() || undefined)
}

/** One page of users, filtered in the database (see the repository). */
export async function listUsersPage(query: adminRepo.UserPageQuery) {
  await requireRole('superadmin')
  return adminRepo.listUsersPage({ ...query, q: query.q?.trim() || undefined })
}

export type AdminUserDetail = {
  legacyUserId: number
  fullName: string | null
  email: string | null
  phone: string | null
  address: string | null
  isActive: boolean
  createdAt: string
  lastLoginAt: string | null
  idVerifiedAt: string | null
  roles: string[]
}

export async function getUserForAdmin(
  legacyUserId: number,
): Promise<AdminUserDetail> {
  await requireRole('superadmin')
  const row = await adminRepo.getUserRow(legacyUserId)
  if (!row) throw new ServiceError('User not found.', 'not_found')
  return {
    legacyUserId: row.legacy_user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    idVerifiedAt: row.id_verified_at,
    roles: row.roles,
  }
}

export async function setUserActive(
  legacyUserId: number,
  input: unknown,
): Promise<void> {
  const actor = await requireRole('superadmin')
  const { is_active } = parseOrThrow(setUserActiveSchema, input)

  if (legacyUserId === actor.legacyUserId && !is_active) {
    throw new ServiceError(
      'You cannot deactivate your own account.',
      'conflict',
    )
  }

  const target = await adminRepo.getUserRow(legacyUserId)
  if (!target) throw new ServiceError('User not found.', 'not_found')

  if (
    !is_active &&
    target.roles.includes('superadmin') &&
    (await adminRepo.countActiveSuperadmins()) <= 1
  ) {
    throw new ServiceError(
      'At least one superadmin must stay active.',
      'conflict',
    )
  }

  await adminRepo.setUserActive(legacyUserId, is_active)
  if (target.auth_user_id) invalidateCurrentUser(target.auth_user_id) // takes effect on their next request
  await recordAudit({
    actor,
    action: is_active ? 'user.activated' : 'user.deactivated',
    targetType: 'user',
    targetId: legacyUserId,
    summary: `${is_active ? 'Activated' : 'Deactivated'} ${target.full_name || target.email || `user #${legacyUserId}`}`,
    details: { email: target.email },
  })
}

/**
 * Issue a new temporary password for someone who is locked out. Shown to the admin once, never
 * stored; the old password stops working at once. Deliberately narrow: not for your own account
 * (use Settings), not for other admins, and not for accounts that sign in with Google (there is no
 * password to reset, and adding one would be a way into someone's account).
 */
export async function resetUserPassword(
  legacyUserId: number,
): Promise<{ email: string; password: string; name: string }> {
  const actor = await requireRole('superadmin')
  if (legacyUserId === actor.legacyUserId) {
    throw new ServiceError(
      'Change your own password under Settings.',
      'conflict',
    )
  }
  const target = await adminRepo.getUserRow(legacyUserId)
  if (!target) throw new ServiceError('User not found.', 'not_found')
  if (target.roles.includes('superadmin')) {
    throw new ServiceError(
      'Another admin’s password can only be changed by that admin.',
      'forbidden',
    )
  }
  if (!target.auth_user_id || !target.email) {
    throw new ServiceError('That account has no sign-in to reset.', 'conflict')
  }

  const auth = createAdminClient().auth.admin
  const { data: found, error: readError } = await auth.getUserById(
    target.auth_user_id,
  )
  if (readError || !found?.user) {
    throw new ServiceError('Could not find that sign-in. Try again.', 'unknown')
  }
  const providers: string[] = found.user.app_metadata?.providers ?? []
  if (providers.length > 0 && !providers.includes('email')) {
    throw new ServiceError(
      'This account signs in with Google, so it has no password to reset.',
      'conflict',
    )
  }

  const password = temporaryPassword()
  const { error } = await auth.updateUserById(target.auth_user_id, { password })
  if (error) {
    throw new ServiceError(
      'Could not set a new password. Please try again.',
      'unknown',
    )
  }

  invalidateCurrentUser(target.auth_user_id)
  const name = target.full_name || target.email
  await recordAudit({
    actor,
    action: 'user.password_reset',
    targetType: 'user',
    targetId: legacyUserId,
    summary: `Issued a new temporary password for ${name}`,
    details: { email: target.email },
  })
  return { email: target.email, password, name }
}

/* ------------------------------------------------------------------ *
 * Landlords — the superadmin provisions them; listing is free
 * ------------------------------------------------------------------ */

export async function createLandlord(
  input: unknown,
): Promise<{ legacyUserId: number }> {
  const actor = await requireRole('superadmin')
  const d = parseOrThrow(createLandlordSchema, input)

  if (await usersRepo.getAccountByEmail(d.email)) {
    throw new ServiceError(
      'An account with that email already exists.',
      'conflict',
      { email: ['This email is already in use.'] },
    )
  }

  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { full_name: d.full_name, role: 'landlord' },
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
      'Could not create the landlord account. Please try again.',
      'unknown',
    )
  }

  const legacyUserId = await adminRepo.ensureLandlordProvisioned({
    authUserId: created.user.id,
    email: d.email,
    fullName: d.full_name,
    businessName: d.business_name ?? null,
  })

  await recordAudit({
    actor,
    action: 'landlord.created',
    targetType: 'user',
    targetId: legacyUserId,
    summary: `Created landlord account for ${d.full_name} (${d.email})`,
  })
  return { legacyUserId }
}

export type AdminLandlordRow = {
  legacyUserId: number
  fullName: string | null
  email: string | null
  isActive: boolean
  propertyCount: number
}

export async function listLandlordsForAdmin(): Promise<AdminLandlordRow[]> {
  await requireRole('superadmin')
  const landlords = await adminRepo.listLandlordAccounts()
  const properties = await propertiesRepo.listProperties({})
  const counts = new Map<number, number>()
  for (const p of properties) {
    if (p.property_owner != null) {
      counts.set(p.property_owner, (counts.get(p.property_owner) ?? 0) + 1)
    }
  }
  return landlords.map((l) => ({
    ...l,
    propertyCount: counts.get(l.legacyUserId) ?? 0,
  }))
}

export async function getLandlordForAdmin(landlordId: number) {
  await requireRole('superadmin')
  const user = await getUserForAdmin(landlordId)
  if (!user.roles.includes('landlord')) {
    throw new ServiceError('That account is not a landlord.', 'not_found')
  }
  const [properties, boosts] = await Promise.all([
    propertiesRepo.listProperties({ ownerId: landlordId }),
    boostsRepo.listByLandlord(landlordId),
  ])
  return {
    user,
    properties: properties.map((p) => ({
      propertyId: p.property_id,
      name: p.property_name,
      address: p.address,
    })),
    boostsBought: boosts.filter(
      (b) => b.status === 'active' || b.status === 'expired',
    ).length,
  }
}
