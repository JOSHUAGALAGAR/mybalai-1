/**
 * Tenant ↔ property matching. Pure (no I/O, no randomness): the same tenant and the same listings
 * always give the same ranking, and every score can be explained line by line.
 *
 * The method is multi-criteria scoring with hard constraints:
 *   1. HARD FILTERS drop listings the tenant cannot actually take (no free bed, wrong kind of
 *      room, far over budget, far outside the area).
 *   2. Each SOFT criterion (budget, distance, amenities, reviews, availability) is scored 0–100.
 *   3. The criteria are combined with fixed weights; a criterion the tenant did not give a
 *      preference for is left out and the others are re-weighted, so a tenant is never penalised
 *      for what they did not ask for.
 *
 * Payment for a boost is deliberately NOT an input: a boosted listing gets no better a fit.
 */

export type Preferences = {
  /** Pesos per month. */
  budgetMin: number | null
  budgetMax: number | null
  area: { lat: number; lng: number } | null
  maxDistanceKm: number
  amenityIds: number[]
  /** Room categories (the landlord's room types: Single, Double, …) the tenant would take; empty = any. */
  roomTypeIds: number[]
}

/** Key for rooms the landlord gave no type. A tenant's chosen types never include it. */
export const UNTYPED = 0

export type Candidate = {
  propertyId: number
  lat: number | null
  lng: number | null
  /** Cheapest monthly-equivalent price per room type that has a free bed (missing = none free; null = no rate yet). Rooms with no type are under `UNTYPED`. */
  priceByType: Record<number, number | null>
  availableBeds: number
  amenityIds: number[]
  ratingAvg: number | null
  ratingCount: number
}

export type Breakdown = Partial<
  Record<
    'budget' | 'distance' | 'amenities' | 'rating' | 'availability',
    number
  >
>

export type Fit = {
  eligible: boolean
  /** 0–100, rounded. 0 when not eligible. */
  score: number
  breakdown: Breakdown
  reasons: string[]
  concerns: string[]
  /** Why it was dropped, when `eligible` is false. */
  excluded?: string
}

export const WEIGHTS = {
  budget: 30,
  distance: 25,
  amenities: 20,
  rating: 15,
  availability: 10,
} as const

/** How far past the budget / distance a listing may go before it is dropped altogether. */
export const BUDGET_HARD_LIMIT = 1.3
export const DISTANCE_HARD_LIMIT = 2

/** A rating prior, so one 5-star review does not outrank forty 4.6s. */
const PRIOR_RATING = 3.8
const PRIOR_WEIGHT = 3

/* ---- helpers ---- */

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Every rate compared per month: a weekly rate ×52/12, a daily one ×30. */
export function monthlyEquivalent(price: number, period: string): number {
  if (period === 'weekly') return (price * 52) / 12
  if (period === 'daily') return price * 30
  return price
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n))
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`

/** The price that matters for this tenant: the cheapest free room of a type they would take (or any type). */
export function relevantPrice(
  prefs: Pick<Preferences, 'roomTypeIds'>,
  c: Pick<Candidate, 'priceByType'>,
): number | null {
  const wanted = prefs.roomTypeIds
  const prices = Object.entries(c.priceByType)
    .filter(([id]) => wanted.length === 0 || wanted.includes(Number(id)))
    .map(([, price]) => price)
    .filter((p): p is number => typeof p === 'number')
  return prices.length > 0 ? Math.min(...prices) : null
}

/** Is there a free room of a type the tenant would take? (Always true when they chose none.) */
export const hasWantedRoom = (
  prefs: Pick<Preferences, 'roomTypeIds'>,
  c: Pick<Candidate, 'priceByType'>,
): boolean =>
  prefs.roomTypeIds.length === 0 ||
  Object.keys(c.priceByType).some((id) =>
    prefs.roomTypeIds.includes(Number(id)),
  )

/* ---- criteria (each 0–100) ---- */

function budgetScore(price: number, max: number): number {
  if (price <= max) return 100
  return clamp(100 * (1 - (price - max) / ((BUDGET_HARD_LIMIT - 1) * max)))
}

function distanceScore(km: number, maxKm: number): number {
  if (km <= maxKm * 0.25) return 100
  if (km <= maxKm) return 100 - 40 * ((km - maxKm * 0.25) / (maxKm * 0.75)) // 100 → 60
  return clamp(60 * (1 - (km - maxKm) / (maxKm * (DISTANCE_HARD_LIMIT - 1)))) // 60 → 0
}

export function ratingScore(avg: number | null, count: number): number {
  const shrunk =
    (count * (avg ?? 0) + PRIOR_WEIGHT * PRIOR_RATING) / (count + PRIOR_WEIGHT)
  return clamp(((shrunk - 1) / 4) * 100)
}

/* ---- the fit ---- */

export function scoreCandidate(
  prefs: Preferences,
  c: Candidate,
  amenityNames: ReadonlyMap<number, string> = new Map(),
): Fit {
  const dropped = (excluded: string): Fit => ({
    eligible: false,
    score: 0,
    breakdown: {},
    reasons: [],
    concerns: [],
    excluded,
  })

  // 1. hard filters
  if (c.availableBeds <= 0) return dropped('No free bed right now.')
  const price = relevantPrice(prefs, c)
  if (!hasWantedRoom(prefs, c)) {
    return dropped('No free room of the type you chose.')
  }
  if (
    prefs.budgetMax !== null &&
    price !== null &&
    price > prefs.budgetMax * BUDGET_HARD_LIMIT
  ) {
    return dropped('Well over your budget.')
  }
  let km: number | null = null
  if (prefs.area && c.lat !== null && c.lng !== null) {
    km = haversineKm(prefs.area, { lat: c.lat, lng: c.lng })
    if (km > prefs.maxDistanceKm * DISTANCE_HARD_LIMIT)
      return dropped('Too far from your area.')
  }

  // 2. soft criteria
  const breakdown: Breakdown = {}
  const reasons: string[] = []
  const concerns: string[] = []

  if (prefs.budgetMax !== null) {
    if (price === null) {
      breakdown.budget = 40 // rate on request: unknown, not bad
      concerns.push('Price on request')
    } else {
      breakdown.budget = budgetScore(price, prefs.budgetMax)
      if (price <= prefs.budgetMax)
        reasons.push(`Within your budget — from ${peso(price)}/month`)
      else concerns.push(`${peso(price - prefs.budgetMax)} over your budget`)
    }
  }

  if (prefs.area) {
    if (km === null) {
      breakdown.distance = 30 // no pin on this listing: unknown
      concerns.push('Location not pinned on the map')
    } else {
      breakdown.distance = distanceScore(km, prefs.maxDistanceKm)
      const label =
        km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
      if (km <= prefs.maxDistanceKm) reasons.push(`${label} from your area`)
      else concerns.push(`${label} away — farther than you wanted`)
    }
  }

  if (prefs.amenityIds.length > 0) {
    const have = new Set(c.amenityIds)
    const wanted = new Set(prefs.amenityIds)
    const matched = [...wanted].filter((id) => have.has(id))
    breakdown.amenities = (matched.length / wanted.size) * 100
    const names = (ids: number[]) =>
      ids
        .map((id) => amenityNames.get(id))
        .filter(Boolean)
        .slice(0, 3)
        .join(', ')
    if (matched.length > 0) {
      reasons.push(
        `Has ${matched.length} of your ${wanted.size} amenities${names(matched) ? `: ${names(matched)}` : ''}`,
      )
    }
    const missing = [...wanted].filter((id) => !have.has(id))
    if (missing.length > 0)
      concerns.push(
        `Missing ${names(missing) || `${missing.length} of your amenities`}`,
      )
  }

  breakdown.rating = ratingScore(c.ratingAvg, c.ratingCount)
  if (c.ratingCount >= 3 && (c.ratingAvg ?? 0) >= 4) {
    reasons.push(
      `Rated ${(c.ratingAvg ?? 0).toFixed(1)} by ${c.ratingCount} tenants`,
    )
  } else if (c.ratingCount === 0) {
    concerns.push('No reviews yet')
  }

  breakdown.availability = clamp((Math.min(c.availableBeds, 3) / 3) * 100)
  if (c.availableBeds >= 3) reasons.push(`${c.availableBeds} beds available`)

  // 3. weighted combination over the criteria that apply
  let weighted = 0
  let total = 0
  for (const [key, value] of Object.entries(breakdown) as [
    keyof Breakdown,
    number,
  ][]) {
    weighted += WEIGHTS[key] * value
    total += WEIGHTS[key]
  }
  const score = total > 0 ? Math.round(weighted / total) : 0
  return {
    eligible: true,
    score,
    breakdown,
    reasons: reasons.slice(0, 3),
    concerns: concerns.slice(0, 2),
  }
}

/** Score everything, drop what the tenant cannot take, best first (ties: more reviews, then id — stable). */
export function rankCandidates(
  prefs: Preferences,
  candidates: Candidate[],
  amenityNames?: ReadonlyMap<number, string>,
): { ranked: { candidate: Candidate; fit: Fit }[]; excluded: number } {
  const all = candidates.map((candidate) => ({
    candidate,
    fit: scoreCandidate(prefs, candidate, amenityNames),
  }))
  const ranked = all
    .filter((r) => r.fit.eligible)
    .sort(
      (a, b) =>
        b.fit.score - a.fit.score ||
        b.candidate.ratingCount - a.candidate.ratingCount ||
        a.candidate.propertyId - b.candidate.propertyId,
    )
  return { ranked, excluded: all.length - ranked.length }
}
