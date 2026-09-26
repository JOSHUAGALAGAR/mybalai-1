import 'server-only'

import { requireUser } from '@/lib/auth/dal'
import { MATCHING_SETUP_MESSAGE, isMatchingSetupProblem } from '@/lib/db-errors'
import {
  monthlyEquivalent,
  rankCandidates,
  relevantPrice,
  UNTYPED,
  type Candidate,
  type Fit,
  type Preferences,
} from '@/lib/matching/score'
import * as discoveryRepo from '@/repositories/discovery.repository'
import * as matchingRepo from '@/repositories/matching.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import { tenantPreferencesSchema } from '@/schemas/matching'
import { ServiceError, parseOrThrow } from '@/services/errors'

/**
 * Intelligent tenant matching for the signed-in tenant (see `lib/matching/score.ts` for the
 * method). The scoring is pure; this service only gathers the facts about every open listing
 * — in a fixed number of queries, however many listings there are — and records what was shown.
 */

async function requireTenant() {
  const user = await requireUser()
  if (!user.roles.includes('tenant')) {
    throw new ServiceError('Matching is for tenant accounts.', 'forbidden')
  }
  return user
}

/* ------------------------------------------------------------------ *
 * Preferences
 * ------------------------------------------------------------------ */

export type MyPreferences = {
  budgetMin: number | null
  budgetMax: number | null
  areaLabel: string | null
  areaLat: number | null
  areaLng: number | null
  maxDistanceKm: number
  amenityIds: number[]
  /** Room types (Single, Double, …) the tenant would take; empty = any. */
  roomTypeIds: number[]
  moveIn: 'this_month' | 'next_month' | 'flexible'
  occupation: 'student' | 'working' | 'other' | null
  schedule: 'day' | 'night' | 'mixed' | null
  noise: 'quiet' | 'balanced' | 'social' | null
  shareLifestyle: boolean
}

const toView = (r: matchingRepo.PreferencesRow): MyPreferences => ({
  budgetMin: r.budget_min === null ? null : Number(r.budget_min),
  budgetMax: r.budget_max === null ? null : Number(r.budget_max),
  areaLabel: r.area_label,
  areaLat: r.area_lat,
  areaLng: r.area_lng,
  maxDistanceKm: Number(r.max_distance_km),
  amenityIds: r.amenity_ids ?? [],
  roomTypeIds: r.room_type_ids ?? [],
  moveIn: r.move_in as MyPreferences['moveIn'],
  occupation: r.occupation as MyPreferences['occupation'],
  schedule: r.schedule as MyPreferences['schedule'],
  noise: r.noise as MyPreferences['noise'],
  shareLifestyle: r.share_lifestyle,
})

async function withSetupHint<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (isMatchingSetupProblem(error)) {
      throw new ServiceError(MATCHING_SETUP_MESSAGE, 'conflict')
    }
    throw error
  }
}

/** `null` = the tenant has not told us what they are looking for yet. */
export const getMyPreferences = (): Promise<MyPreferences | null> =>
  withSetupHint(loadMyPreferences)

async function loadMyPreferences(): Promise<MyPreferences | null> {
  const user = await requireTenant()
  const row = await matchingRepo.getPreferences(user.legacyUserId)
  return row ? toView(row) : null
}

export const saveMyPreferences = (input: unknown): Promise<MyPreferences> =>
  withSetupHint(() => storeMyPreferences(input))

async function storeMyPreferences(input: unknown): Promise<MyPreferences> {
  const user = await requireTenant()
  const d = parseOrThrow(tenantPreferencesSchema, input)
  const row = await matchingRepo.upsertPreferences({
    legacy_user_id: user.legacyUserId,
    budget_min: d.budget_min,
    budget_max: d.budget_max,
    area_label: d.area_label,
    area_lat: d.area_lat,
    area_lng: d.area_lng,
    max_distance_km: d.max_distance_km,
    amenity_ids: [...new Set(d.amenity_ids)],
    room_type_ids: [...new Set(d.room_type_ids)],
    move_in: d.move_in,
    occupation: d.occupation,
    schedule: d.schedule,
    noise: d.noise,
    share_lifestyle: d.share_lifestyle,
  })
  return toView(row)
}

export const clearMyPreferences = (): Promise<void> =>
  withSetupHint(removeMyPreferences)

async function removeMyPreferences(): Promise<void> {
  const user = await requireTenant()
  await matchingRepo.deletePreferences(user.legacyUserId)
}

const toScoringPrefs = (p: MyPreferences): Preferences => ({
  budgetMin: p.budgetMin,
  budgetMax: p.budgetMax,
  area:
    p.areaLat !== null && p.areaLng !== null
      ? { lat: p.areaLat, lng: p.areaLng }
      : null,
  maxDistanceKm: p.maxDistanceKm,
  amenityIds: p.amenityIds,
  roomTypeIds: p.roomTypeIds,
})

/* ------------------------------------------------------------------ *
 * Matches
 * ------------------------------------------------------------------ */

export type MatchItem = {
  propertyId: number
  name: string
  address: string
  typeName: string | null
  imageUrl: string | null
  fromPrice: number | null
  fromPeriod: string | null
  amenityCount: number
  ratingAvg: number | null
  ratingCount: number
  fit: { score: number; reasons: string[]; concerns: string[] }
}

export type Matches =
  | { needsPreferences: true }
  | {
      needsPreferences: false
      items: MatchItem[]
      considered: number
      excluded: number
    }

/** Recommendations are recorded at most this often per tenant, so pull-to-refresh does not flood the log. */
const LOG_EVERY_MS = 10 * 60_000

export const getMyMatches = (limit = 10): Promise<Matches> =>
  withSetupHint(() => computeMyMatches(limit))

async function computeMyMatches(limit: number): Promise<Matches> {
  const user = await requireTenant()
  const stored = await matchingRepo.getPreferences(user.legacyUserId)
  if (!stored) return { needsPreferences: true }
  const prefs = toView(stored)

  const properties = await discoveryRepo.listVisibleProperties({})
  const ids = properties.map((p) => p.property_id)

  const [
    rates,
    links,
    ratings,
    rooms,
    types,
    amenities,
    bedStatuses,
    roomStatuses,
  ] = await Promise.all([
    discoveryRepo.listActiveRates(ids),
    discoveryRepo.listAmenityLinks(ids),
    discoveryRepo.listRatings(ids),
    discoveryRepo.listRoomsForProperties(ids),
    referenceRepo.listPropertyTypes(),
    referenceRepo.listAmenities(),
    referenceRepo.listBedStatuses(),
    referenceRepo.listRoomStatuses(),
  ])
  const beds = await discoveryRepo.listBedsForRooms(rooms.map((r) => r.room_id))

  const freeBedId = bedStatuses.find(
    (s) => s.status_code === 'available',
  )?.bed_status_id
  const closedRooms = new Set(
    roomStatuses
      .filter((s) => ['maintenance', 'inactive'].includes(s.status_code))
      .map((s) => s.room_status_id),
  )

  // A room counts only while it is open and has at least one free bed.
  const freeBedsByRoom = new Map<number, number>()
  for (const b of beds) {
    if (b.status_id === freeBedId)
      freeBedsByRoom.set(b.room_id, (freeBedsByRoom.get(b.room_id) ?? 0) + 1)
  }
  const roomsByProperty = new Map<number, typeof rooms>()
  for (const r of rooms) {
    if (r.status_id !== null && closedRooms.has(r.status_id)) continue
    if (!freeBedsByRoom.has(r.room_id)) continue
    roomsByProperty.set(r.property_id, [
      ...(roomsByProperty.get(r.property_id) ?? []),
      r,
    ])
  }
  const roomById = new Map(rooms.map((r) => [r.room_id, r]))

  const ratesByProperty = new Map<number, typeof rates>()
  for (const r of rates)
    ratesByProperty.set(r.property_id, [
      ...(ratesByProperty.get(r.property_id) ?? []),
      r,
    ])
  const amenitiesByProperty = new Map<number, number[]>()
  for (const l of links) {
    amenitiesByProperty.set(l.property_id, [
      ...(amenitiesByProperty.get(l.property_id) ?? []),
      l.amenity_id,
    ])
  }
  const ratingsByProperty = new Map<number, number[]>()
  for (const r of ratings)
    ratingsByProperty.set(r.property_id, [
      ...(ratingsByProperty.get(r.property_id) ?? []),
      r.rating,
    ])

  const candidates: Candidate[] = properties.map((p) => {
    const open = roomsByProperty.get(p.property_id) ?? []
    const openIds = new Set(open.map((r) => r.room_id))
    const priceByType: Candidate['priceByType'] = {}
    for (const rate of ratesByProperty.get(p.property_id) ?? []) {
      if (!openIds.has(rate.room_id)) continue
      const room = roomById.get(rate.room_id)
      if (!room) continue
      const type = room.room_type_id ?? UNTYPED
      const monthly = monthlyEquivalent(Number(rate.price), rate.period)
      const best = priceByType[type]
      if (typeof best !== 'number' || monthly < best)
        priceByType[type] = monthly
    }
    // an open room with no rate yet still counts as a room of its type (price unknown)
    for (const room of open) {
      const type = room.room_type_id ?? UNTYPED
      if (!(type in priceByType)) priceByType[type] = null
    }
    const stars = ratingsByProperty.get(p.property_id) ?? []
    return {
      propertyId: p.property_id,
      lat: p.latitude,
      lng: p.longitude,
      priceByType,
      availableBeds: open.reduce(
        (n, r) => n + (freeBedsByRoom.get(r.room_id) ?? 0),
        0,
      ),
      amenityIds: amenitiesByProperty.get(p.property_id) ?? [],
      ratingAvg:
        stars.length > 0
          ? stars.reduce((a, b) => a + b, 0) / stars.length
          : null,
      ratingCount: stars.length,
    }
  })

  const amenityNames = new Map(
    amenities.map((a) => [a.amenity_id, a.amenity_name]),
  )
  const scoring = toScoringPrefs(prefs)
  const { ranked, excluded } = rankCandidates(scoring, candidates, amenityNames)

  const typeName = new Map(types.map((t) => [t.property_type_id, t.type_name]))
  const propertyById = new Map(properties.map((p) => [p.property_id, p]))
  const top = ranked.slice(0, Math.max(1, Math.min(limit, 30)))

  const items: MatchItem[] = top.map(({ candidate, fit }) => {
    const p = propertyById.get(candidate.propertyId)!
    // the "from" price is the cheapest the tenant would actually pay (a room type they would take, with a free bed)
    const from = relevantPrice(scoring, candidate)
    return {
      propertyId: p.property_id,
      name: p.property_name,
      address: p.address,
      typeName:
        p.property_type_id != null
          ? (typeName.get(p.property_type_id) ?? null)
          : null,
      imageUrl: p.property_image,
      fromPrice: from === null ? null : Math.round(from),
      fromPeriod: from === null ? null : 'monthly',
      amenityCount: candidate.amenityIds.length,
      ratingAvg:
        candidate.ratingAvg === null
          ? null
          : Math.round(candidate.ratingAvg * 10) / 10,
      ratingCount: candidate.ratingCount,
      fit: publicFit(fit),
    }
  })

  await recordShown(user.legacyUserId, items)
  return {
    needsPreferences: false,
    items,
    considered: candidates.length,
    excluded,
  }
}

const publicFit = (fit: Fit) => ({
  score: fit.score,
  reasons: fit.reasons,
  concerns: fit.concerns,
})

/** Best-effort evaluation log: a logging problem must never hide the recommendations. */
async function recordShown(userId: number, items: MatchItem[]): Promise<void> {
  try {
    const last = await matchingRepo.lastLoggedAt(userId)
    if (last && Date.now() - new Date(last).getTime() < LOG_EVERY_MS) return
    await matchingRepo.insertLogs(
      items.map((item, i) => ({
        user_id: userId,
        property_id: item.propertyId,
        rank: i + 1,
        score: item.fit.score,
      })),
    )
  } catch (error) {
    console.error('[matching] could not write the match log:', error)
  }
}
