import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/dal'
import * as adminRepo from '@/repositories/admin.repository'
import * as bedsRepo from '@/repositories/beds.repository'
import * as caretakersRepo from '@/repositories/caretakers.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import * as subsRepo from '@/repositories/subscriptions.repository'
import * as usersRepo from '@/repositories/users.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import {
  assignSubscriptionSchema,
  createLandlordSchema,
  planFormSchema,
} from '@/schemas/subscription'

const NO_PLAN_MSG =
  'This landlord account has no active subscription. A superadmin must assign a plan before listings can be added.'

/* ------------------------------------------------------------------ *
 * Effective limits + enforcement (called by the property / room /
 * bed / caretaker services)
 * ------------------------------------------------------------------ */

export type EffectiveLimits = {
  planId: number
  planName: string
  planCode: string
  maxProperties: number
  maxRoomsPerProperty: number
  maxBedsPerRoom: number
  maxCaretakers: number
}

function isEffective(sub: subsRepo.SubscriptionRow): boolean {
  if (sub.status !== 'active') return false
  if (sub.ends_at && new Date(sub.ends_at).getTime() <= Date.now()) return false
  return true
}

export async function getEffectiveLimits(
  landlordId: number,
): Promise<EffectiveLimits | null> {
  const sub = await subsRepo.getSubscriptionForLandlord(landlordId)
  if (!sub || !isEffective(sub)) return null
  const plan = await subsRepo.getPlan(sub.plan_id)
  if (!plan || !plan.is_active) return null
  return {
    planId: plan.plan_id,
    planName: plan.name,
    planCode: plan.code,
    maxProperties: plan.max_properties,
    maxRoomsPerProperty: plan.max_rooms_per_property,
    maxBedsPerRoom: plan.max_beds_per_room,
    maxCaretakers: plan.max_caretakers,
  }
}

async function limitsOrThrow(landlordId: number): Promise<EffectiveLimits> {
  const limits = await getEffectiveLimits(landlordId)
  if (!limits) throw new ServiceError(NO_PLAN_MSG, 'forbidden')
  return limits
}

export async function assertCanAddProperty(landlordId: number): Promise<void> {
  const limits = await limitsOrThrow(landlordId)
  const used = (await propertiesRepo.listProperties({ ownerId: landlordId }))
    .length
  if (used >= limits.maxProperties) {
    throw new ServiceError(
      `Your ${limits.planName} plan allows ${limits.maxProperties} ${
        limits.maxProperties === 1 ? 'property' : 'properties'
      }. Ask the superadmin to change your plan.`,
      'conflict',
    )
  }
}

export async function assertCanAddRoom(
  landlordId: number,
  propertyId: number,
): Promise<void> {
  const limits = await limitsOrThrow(landlordId)
  const used = (await roomsRepo.listRoomsByProperty(propertyId)).length
  if (used >= limits.maxRoomsPerProperty) {
    throw new ServiceError(
      `Your ${limits.planName} plan allows ${limits.maxRoomsPerProperty} rooms per property.`,
      'conflict',
    )
  }
}

export async function assertCanAddBed(
  landlordId: number,
  roomId: number,
): Promise<void> {
  const limits = await limitsOrThrow(landlordId)
  const used = (await bedsRepo.listBedsByRoom(roomId)).length
  if (used >= limits.maxBedsPerRoom) {
    throw new ServiceError(
      `Your ${limits.planName} plan allows ${limits.maxBedsPerRoom} beds per room.`,
      'conflict',
    )
  }
}

export async function assertCanAddCaretaker(landlordId: number): Promise<void> {
  const limits = await limitsOrThrow(landlordId)
  const used = (await caretakersRepo.listCaretakerIdsForLandlord(landlordId))
    .length
  if (used >= limits.maxCaretakers) {
    throw new ServiceError(
      `Your ${limits.planName} plan allows ${limits.maxCaretakers} ${
        limits.maxCaretakers === 1 ? 'caretaker' : 'caretakers'
      }.`,
      'conflict',
    )
  }
}

/* ------------------------------------------------------------------ *
 * Superadmin — plan catalog
 * ------------------------------------------------------------------ */

export type PlanView = subsRepo.PlanRow

export async function listPlansForAdmin(): Promise<PlanView[]> {
  await requireRole('superadmin')
  return subsRepo.listPlans()
}

export async function getPlanForAdmin(planId: number): Promise<PlanView> {
  await requireRole('superadmin')
  const plan = await subsRepo.getPlan(planId)
  if (!plan) throw new ServiceError('Plan not found.', 'not_found')
  return plan
}

function toPlanValues(d: ReturnType<typeof planFormSchema.parse>) {
  return {
    code: d.code,
    name: d.name,
    description: d.description ?? null,
    max_properties: d.max_properties,
    max_rooms_per_property: d.max_rooms_per_property,
    max_beds_per_room: d.max_beds_per_room,
    max_caretakers: d.max_caretakers,
    price: d.price,
    billing_interval_days: d.billing_interval_days,
    is_active: d.is_active,
    sort_order: d.sort_order ?? 0,
  }
}

export async function createPlan(input: unknown): Promise<PlanView> {
  await requireRole('superadmin')
  const d = parseOrThrow(planFormSchema, input)
  return subsRepo.insertPlan(toPlanValues(d))
}

export async function updatePlan(
  planId: number,
  input: unknown,
): Promise<PlanView> {
  await requireRole('superadmin')
  const existing = await subsRepo.getPlan(planId)
  if (!existing) throw new ServiceError('Plan not found.', 'not_found')
  const d = parseOrThrow(planFormSchema, input)
  return subsRepo.updatePlan(planId, toPlanValues(d))
}

/* ------------------------------------------------------------------ *
 * Superadmin — landlord subscriptions
 * ------------------------------------------------------------------ */

export type AdminSubscriptionRow = {
  subscriptionId: number
  landlordId: number
  landlordName: string | null
  landlordEmail: string | null
  planId: number
  planName: string
  status: string
  startsAt: string
  endsAt: string | null
  propertiesUsed: number
  note: string | null
}

export async function listLandlordSubscriptions(): Promise<
  AdminSubscriptionRow[]
> {
  await requireRole('superadmin')
  const [subs, plans] = await Promise.all([
    subsRepo.listSubscriptions(),
    subsRepo.listPlans(),
  ])
  const planById = new Map(plans.map((p) => [p.plan_id, p]))

  const rows = await Promise.all(
    subs.map(async (s) => {
      const [account, props] = await Promise.all([
        usersRepo.getAccountById(s.landlord_id),
        propertiesRepo.listProperties({ ownerId: s.landlord_id }),
      ])
      return {
        subscriptionId: s.subscription_id,
        landlordId: s.landlord_id,
        landlordName: account?.full_name ?? null,
        landlordEmail: account?.email ?? null,
        planId: s.plan_id,
        planName: planById.get(s.plan_id)?.name ?? `Plan #${s.plan_id}`,
        status: s.status,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        propertiesUsed: props.length,
        note: s.note,
      }
    }),
  )
  return rows
}

export async function getLandlordSubscription(landlordId: number): Promise<{
  landlordId: number
  landlordName: string | null
  landlordEmail: string | null
  subscription: subsRepo.SubscriptionRow | null
  plans: PlanView[]
}> {
  await requireRole('superadmin')
  const account = await usersRepo.getAccountById(landlordId)
  if (!account) throw new ServiceError('Landlord not found.', 'not_found')
  const roles = await usersRepo.getRoleCodes(landlordId)
  if (!roles.includes('landlord')) {
    throw new ServiceError('That account is not a landlord.', 'validation')
  }
  const [subscription, plans] = await Promise.all([
    subsRepo.getSubscriptionForLandlord(landlordId),
    subsRepo.listPlans(),
  ])
  return {
    landlordId,
    landlordName: account.full_name,
    landlordEmail: account.email,
    subscription,
    plans,
  }
}

export async function assignSubscription(input: unknown): Promise<void> {
  const actor = await requireRole('superadmin')
  const d = parseOrThrow(assignSubscriptionSchema, input)

  const account = await usersRepo.getAccountById(d.landlord_id)
  if (!account) throw new ServiceError('Landlord not found.', 'not_found')
  const roles = await usersRepo.getRoleCodes(d.landlord_id)
  if (!roles.includes('landlord')) {
    throw new ServiceError('That account is not a landlord.', 'validation')
  }
  const plan = await subsRepo.getPlan(d.plan_id)
  if (!plan) {
    throw new ServiceError('Choose a valid plan.', 'validation', {
      plan_id: ['Choose a valid plan.'],
    })
  }

  await subsRepo.upsertSubscription({
    landlord_id: d.landlord_id,
    plan_id: d.plan_id,
    status: d.status,
    ends_at: d.ends_at ?? null,
    assigned_by: actor.legacyUserId,
    note: d.note ?? null,
  })
}

/* ------------------------------------------------------------------ *
 * Superadmin — provision a landlord account
 * ------------------------------------------------------------------ */

export async function createLandlord(input: unknown): Promise<{
  legacyUserId: number
}> {
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

  if (d.plan_id) {
    const plan = await subsRepo.getPlan(d.plan_id)
    if (plan) {
      await subsRepo.upsertSubscription({
        landlord_id: legacyUserId,
        plan_id: d.plan_id,
        status: 'active',
        assigned_by: actor.legacyUserId,
        note: 'Assigned at account creation.',
      })
    }
  }

  return { legacyUserId }
}

/* ------------------------------------------------------------------ *
 * Superadmin — /admin overview tile
 * ------------------------------------------------------------------ */

export async function getSubscriptionOverview(): Promise<{
  plans: number
  activePlans: number
  landlords: number
  withActiveSubscription: number
}> {
  await requireRole('superadmin')
  const [plans, subs, landlords] = await Promise.all([
    subsRepo.listPlans(),
    subsRepo.listSubscriptions(),
    adminRepo.listLandlordAccounts(),
  ])
  return {
    plans: plans.length,
    activePlans: plans.filter((p) => p.is_active).length,
    landlords: landlords.length,
    withActiveSubscription: subs.filter(isEffective).length,
  }
}

/* ------------------------------------------------------------------ *
 * Landlord — "My plan"
 * ------------------------------------------------------------------ */

export type MyPlan = {
  isActive: boolean
  status: string | null
  startsAt: string | null
  endsAt: string | null
  plan: {
    name: string
    code: string
    maxProperties: number
    maxRoomsPerProperty: number
    maxBedsPerRoom: number
    maxCaretakers: number
  } | null
  usage: { properties: number; caretakers: number }
}

export async function getMyPlan(): Promise<MyPlan> {
  const user = await requireRole('landlord', 'superadmin')
  const [sub, props, caretakerIds] = await Promise.all([
    subsRepo.getSubscriptionForLandlord(user.legacyUserId),
    propertiesRepo.listProperties({ ownerId: user.legacyUserId }),
    caretakersRepo.listCaretakerIdsForLandlord(user.legacyUserId),
  ])
  const plan = sub ? await subsRepo.getPlan(sub.plan_id) : null

  return {
    isActive: sub ? isEffective(sub) && (plan?.is_active ?? false) : false,
    status: sub?.status ?? null,
    startsAt: sub?.starts_at ?? null,
    endsAt: sub?.ends_at ?? null,
    plan: plan
      ? {
          name: plan.name,
          code: plan.code,
          maxProperties: plan.max_properties,
          maxRoomsPerProperty: plan.max_rooms_per_property,
          maxBedsPerRoom: plan.max_beds_per_room,
          maxCaretakers: plan.max_caretakers,
        }
      : null,
    usage: { properties: props.length, caretakers: caretakerIds.length },
  }
}

export type PurchasablePlan = {
  planId: number
  name: string
  description: string | null
  price: number
  intervalDays: number
  maxProperties: number
  maxRoomsPerProperty: number
  maxBedsPerRoom: number
  maxCaretakers: number
}

/** Active, priced plans a landlord can buy online. */
export async function listPurchasablePlans(): Promise<PurchasablePlan[]> {
  await requireRole('landlord', 'superadmin')
  const plans = await subsRepo.listPlans({ activeOnly: true })
  return plans
    .filter((p) => Number(p.price) > 0)
    .map((p) => ({
      planId: p.plan_id,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      intervalDays: p.billing_interval_days,
      maxProperties: p.max_properties,
      maxRoomsPerProperty: p.max_rooms_per_property,
      maxBedsPerRoom: p.max_beds_per_room,
      maxCaretakers: p.max_caretakers,
    }))
}
