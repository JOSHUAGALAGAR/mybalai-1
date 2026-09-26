import 'server-only'

import { requireRole } from '@/lib/auth/dal'
import { boostState, daysLeft } from '@/lib/boosts/rules'
import { isSuperadmin } from '@/lib/permissions/properties'
import * as repo from '@/repositories/boosts.repository'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as messagingRepo from '@/repositories/messaging.repository'
import * as usersRepo from '@/repositories/users.repository'
import { boostPackageSchema } from '@/schemas/boosts'
import { recordAudit } from '@/services/audit.service'
import { ServiceError, parseOrThrow } from '@/services/errors'
import { reconcileMyPendingBoosts } from '@/services/paymongo.service'

export type BoostPackage = {
  packageId: number
  name: string
  days: number
  price: number
  isActive: boolean
}

const toPackage = (p: repo.PackageRow): BoostPackage => ({
  packageId: p.package_id,
  name: p.name,
  days: p.days,
  price: Number(p.price),
  isActive: p.is_active,
})

/** Which properties are boosted right now. Never fails the page that asks (search, lists). */
export async function liveBoostedIds(now = new Date()): Promise<Set<number>> {
  try {
    return await repo.liveBoostedPropertyIds(now.toISOString())
  } catch (error) {
    console.error('[boosts] could not load live boosts:', error)
    return new Set()
  }
}

/* ------------------------------------------------------------------ *
 * Superadmin — packages and overview
 * ------------------------------------------------------------------ */

export async function listPackagesForAdmin(): Promise<BoostPackage[]> {
  await requireRole('superadmin')
  return (await repo.listPackages()).map(toPackage)
}

export async function savePackage(
  id: number | null,
  input: unknown,
): Promise<void> {
  const actor = await requireRole('superadmin')
  const d = parseOrThrow(boostPackageSchema, input)
  if (id === null) {
    const existing = await repo.listPackages()
    const created = await repo.insertPackage({
      ...d,
      sort_order: existing.length + 1,
    })
    await recordAudit({
      actor,
      action: 'boost.package_saved',
      targetType: 'boost_package',
      targetId: created.package_id,
      summary: `Created boost “${d.name}” (${d.days} days, ₱${d.price})`,
    })
    return
  }
  if (!(await repo.getPackage(id)))
    throw new ServiceError('Boost not found.', 'not_found')
  await repo.updatePackage(id, d)
  await recordAudit({
    actor,
    action: 'boost.package_saved',
    targetType: 'boost_package',
    targetId: id,
    summary: `Updated boost “${d.name}” (${d.days} days, ₱${d.price}${d.is_active ? '' : ', hidden'})`,
  })
}

export type AdminBoostRow = {
  boostId: number
  propertyName: string
  landlordName: string
  days: number | null
  amount: number
  state: ReturnType<typeof boostState>
  paidAt: string | null
  endsAt: string | null
}

export type BoostOverview = {
  liveNow: number
  revenueTotal: number
  revenueThisMonth: number
  rows: AdminBoostRow[]
}

export async function getBoostOverview(
  now = new Date(),
): Promise<BoostOverview> {
  await requireRole('superadmin')
  const boosts = await repo.listAll(200)
  const [names, accounts] = await Promise.all([
    bookingsRepo.propertyNamesByIds(boosts.map((b) => b.property_id)),
    usersRepo.listAccountsByIds(boosts.map((b) => b.landlord_id)),
  ])
  const landlord = new Map(
    accounts.map((a) => [
      a.legacy_user_id,
      a.full_name || a.email || `#${a.legacy_user_id}`,
    ]),
  )
  const paid = boosts.filter(
    (b) => b.status === 'active' || b.status === 'expired',
  )
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    liveNow: boosts.filter((b) => boostState(b, now) === 'live').length,
    revenueTotal: paid.reduce((n, b) => n + Number(b.amount), 0),
    revenueThisMonth: paid
      .filter((b) => b.paid_at && new Date(b.paid_at) >= monthStart)
      .reduce((n, b) => n + Number(b.amount), 0),
    rows: boosts.map((b) => ({
      boostId: b.boost_id,
      propertyName: names.get(b.property_id) ?? `Property #${b.property_id}`,
      landlordName: landlord.get(b.landlord_id) ?? `#${b.landlord_id}`,
      days: b.days,
      amount: Number(b.amount),
      state: boostState(b, now),
      paidAt: b.paid_at,
      endsAt: b.ends_at,
    })),
  }
}

/* ------------------------------------------------------------------ *
 * Landlord — boost a property (optional, paid)
 * ------------------------------------------------------------------ */

export type MyBoostRow = {
  boostId: number
  propertyId: number
  propertyName: string
  days: number | null
  amount: number
  state: ReturnType<typeof boostState>
  startsAt: string | null
  endsAt: string | null
  daysLeft: number | null
}

export type MyBoosts = {
  packages: BoostPackage[]
  /** Properties that can be boosted (approved / active). */
  properties: { propertyId: number; name: string; liveUntil: string | null }[]
  boosts: MyBoostRow[]
}

export async function getMyBoosts(now = new Date()): Promise<MyBoosts> {
  const user = await requireRole('landlord', 'superadmin')
  await reconcileMyPendingBoosts() // pick up a payment the webhook could not deliver
  await repo.expireEnded().catch(() => {}) // mark finished boosts as ended (housekeeping only)

  const [packages, allProps, boosts, statuses] = await Promise.all([
    repo.listPackages({ activeOnly: true }),
    propertiesRepo.listProperties(
      isSuperadmin(user) ? {} : { ownerId: user.legacyUserId },
    ),
    repo.listByLandlord(user.legacyUserId),
    referenceRepo.listPropertyStatuses(),
  ])
  const activeId = statuses.find(
    (s) => s.status_code === 'active',
  )?.property_status_id
  const eligible = allProps.filter((p) => p.status_id === activeId)
  const names = new Map(allProps.map((p) => [p.property_id, p.property_name]))

  const liveUntil = new Map<number, string>()
  for (const b of boosts) {
    if (boostState(b, now) === 'live' && b.ends_at)
      liveUntil.set(b.property_id, b.ends_at)
  }

  return {
    packages: packages.map(toPackage),
    properties: eligible.map((p) => ({
      propertyId: p.property_id,
      name: p.property_name,
      liveUntil: liveUntil.get(p.property_id) ?? null,
    })),
    boosts: boosts
      .filter((b) => b.status !== 'cancelled')
      .map((b) => ({
        boostId: b.boost_id,
        propertyId: b.property_id,
        propertyName: names.get(b.property_id) ?? `Property #${b.property_id}`,
        days: b.days,
        amount: Number(b.amount),
        state: boostState(b, now),
        startsAt: b.starts_at,
        endsAt: b.ends_at,
        daysLeft: b.ends_at ? daysLeft(b.ends_at, now) : null,
      })),
  }
}

/** Stop a boost (superadmin). `refunded` records that its money was given back at PayMongo. */
export async function cancelBoost(
  boostId: number,
  input: { reason?: string; refunded?: boolean },
): Promise<void> {
  const actor = await requireRole('superadmin')
  const reason = (input.reason ?? '').trim()
  if (reason.length < 3) {
    throw new ServiceError('Say why (at least 3 characters).', 'validation', {
      reason: ['Say why (at least 3 characters).'],
    })
  }
  const boost = await repo.getBoost(boostId)
  if (!boost) throw new ServiceError('Boost not found.', 'not_found')
  const ok = await repo.cancelBoost(boostId, {
    reason,
    refunded: Boolean(input.refunded),
  })
  if (!ok)
    throw new ServiceError(
      'This boost is already finished or cancelled.',
      'conflict',
    )
  await recordAudit({
    actor,
    action: 'boost.cancelled',
    targetType: 'boost',
    targetId: boostId,
    summary: `Cancelled boost #${boostId}${input.refunded ? ' (refunded)' : ''}: ${reason}`,
  })
  await messagingRepo
    .notify({
      user_id: boost.landlord_id,
      notification_type: 'PAYMENT',
      title: 'Boost cancelled',
      message: `Your boost was cancelled: ${reason}.${input.refunded ? ' It was refunded.' : ''}`,
      reference_type: 'boost',
      reference_id: boostId,
    })
    .catch((error) => console.error('[boosts] notify failed:', error))
}
