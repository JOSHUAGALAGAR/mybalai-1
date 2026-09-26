import { describe, expect, it } from 'vitest'

import {
  BUDGET_HARD_LIMIT,
  haversineKm,
  monthlyEquivalent,
  rankCandidates,
  ratingScore,
  relevantPrice,
  scoreCandidate,
  UNTYPED,
  type Candidate,
  type Preferences,
} from '@/lib/matching/score'

const CAMPUS = { lat: 9.6398, lng: 123.8555 } // Tagbilaran
const near = (dLat: number) => ({ lat: CAMPUS.lat + dLat, lng: CAMPUS.lng })

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  budgetMin: null,
  budgetMax: 3000,
  area: CAMPUS,
  maxDistanceKm: 3,
  amenityIds: [],
  roomTypeIds: [],
  ...over,
})
/** Room type ids as seeded: Single, Double, Quad. */
const SINGLE = 1
const DOUBLE = 2
const QUAD = 4
const cand = (over: Partial<Candidate> = {}): Candidate => ({
  propertyId: 1,
  lat: near(0.002).lat,
  lng: near(0.002).lng,
  priceByType: { [QUAD]: 2500 },
  availableBeds: 4,
  amenityIds: [],
  ratingAvg: 4.5,
  ratingCount: 10,
  ...over,
})

describe('helpers', () => {
  it('measures distance', () => {
    expect(haversineKm(CAMPUS, CAMPUS)).toBe(0)
    expect(haversineKm(CAMPUS, near(0.009))).toBeCloseTo(1, 1) // 0.009° of latitude ≈ 1 km
  })
  it('compares every rate per month', () => {
    expect(monthlyEquivalent(3000, 'monthly')).toBe(3000)
    expect(monthlyEquivalent(1000, 'weekly')).toBeCloseTo(4333.3, 1)
    expect(monthlyEquivalent(100, 'daily')).toBe(3000)
  })
  it('does not let one 5-star review beat many good ones', () => {
    expect(ratingScore(5, 1)).toBeLessThan(ratingScore(4.6, 40))
    expect(ratingScore(null, 0)).toBeGreaterThan(50) // unknown is not bad
  })
})

describe('hard filters', () => {
  it('drops a listing with no free bed', () => {
    expect(scoreCandidate(prefs(), cand({ availableBeds: 0 }))).toMatchObject({
      eligible: false,
      score: 0,
      excluded: expect.stringMatching(/free bed/),
    })
  })
  it('drops a listing without a free room of a type asked for', () => {
    expect(
      scoreCandidate(prefs({ roomTypeIds: [SINGLE] }), cand()).excluded,
    ).toMatch(/type you chose/)
    expect(
      scoreCandidate(
        prefs({ roomTypeIds: [QUAD] }),
        cand({ priceByType: { [SINGLE]: 4000 } }),
      ).excluded,
    ).toMatch(/type you chose/)
    expect(
      scoreCandidate(
        prefs({ roomTypeIds: [SINGLE] }),
        cand({ priceByType: { [SINGLE]: 2800 } }),
      ).eligible,
    ).toBe(true)
  })
  it('accepts any of several chosen types, and prices only those', () => {
    const c = cand({
      priceByType: { [SINGLE]: 3200, [QUAD]: 1500, [UNTYPED]: 900 },
    })
    const chosen = prefs({ roomTypeIds: [SINGLE, DOUBLE] })
    expect(scoreCandidate(chosen, c).eligible).toBe(true)
    expect(relevantPrice(chosen, c)).toBe(3200) // not the cheaper Quad or untyped rooms
    expect(relevantPrice(prefs(), c)).toBe(900) // no preference: every room counts
  })
  it('counts a chosen type with no rate yet as available (price unknown)', () => {
    const c = cand({ priceByType: { [DOUBLE]: null } })
    expect(scoreCandidate(prefs({ roomTypeIds: [DOUBLE] }), c).eligible).toBe(
      true,
    )
  })
  it('drops what is far over budget or far from the area, but keeps the merely slightly over', () => {
    expect(
      scoreCandidate(
        prefs(),
        cand({ priceByType: { [QUAD]: 3000 * BUDGET_HARD_LIMIT + 1 } }),
      ).excluded,
    ).toMatch(/budget/)
    expect(
      scoreCandidate(prefs(), cand({ priceByType: { [QUAD]: 3300 } })).eligible,
    ).toBe(true)
    expect(
      scoreCandidate(
        prefs(),
        cand({ lat: near(0.09).lat, lng: near(0.09).lng }),
      ).excluded,
    ).toMatch(/far/) // ~10 km > 2×3
  })
})

describe('scoring', () => {
  it('a nearby, in-budget, well-reviewed listing scores high, with reasons the tenant can read', () => {
    const fit = scoreCandidate(prefs(), cand())
    expect(fit.score).toBeGreaterThanOrEqual(85)
    expect(fit.reasons.join(' | ')).toMatch(/Within your budget — from ₱2,500/)
    expect(fit.reasons.join(' | ')).toMatch(/from your area/)
    expect(fit.reasons.join(' | ')).toMatch(/Rated 4.5 by 10/)
  })
  it('is better when cheaper-than-budget, closer, and more complete', () => {
    const base = scoreCandidate(prefs(), cand()).score
    expect(
      scoreCandidate(prefs(), cand({ priceByType: { [QUAD]: 3200 } })).score,
    ).toBeLessThan(base)
    expect(
      scoreCandidate(
        prefs(),
        cand({ lat: near(0.03).lat, lng: near(0.03).lng }),
      ).score,
    ).toBeLessThan(base)
    expect(
      scoreCandidate(prefs(), cand({ availableBeds: 1 })).score,
    ).toBeLessThan(base)
  })
  it('counts the amenities wanted, names what is missing', () => {
    const names = new Map([
      [1, 'WiFi'],
      [2, 'Laundry'],
      [3, 'Aircon'],
    ])
    const fit = scoreCandidate(
      prefs({ amenityIds: [1, 2, 3] }),
      cand({ amenityIds: [1, 2] }),
      names,
    )
    expect(fit.breakdown.amenities).toBeCloseTo(66.7, 1)
    expect(fit.reasons.join(' ')).toMatch(
      /2 of your 3 amenities: WiFi, Laundry/,
    )
    expect(fit.concerns.join(' ')).toMatch(/Missing Aircon/)
  })
  it('leaves out what the tenant did not ask about, instead of punishing for it', () => {
    const noArea = scoreCandidate(
      prefs({ area: null, budgetMax: null }),
      cand({ lat: null, lng: null }),
    )
    expect(Object.keys(noArea.breakdown).sort()).toEqual([
      'availability',
      'rating',
    ])
    expect(noArea.score).toBeGreaterThan(60)
  })
  it('treats an unpinned listing or an unpriced one as unknown (not terrible)', () => {
    const fit = scoreCandidate(
      prefs(),
      cand({ lat: null, lng: null, priceByType: {} }),
    )
    expect(fit.eligible).toBe(true)
    expect(fit.concerns.join(' ')).toMatch(/not pinned/)
    expect(fit.concerns.join(' ')).toMatch(/Price on request/)
  })
  it('converts weekly and daily prices before comparing with a monthly budget', () => {
    const weekly = monthlyEquivalent(1000, 'weekly') // ₱4,333/month — well over a ₱3,000 budget
    expect(
      scoreCandidate(prefs(), cand({ priceByType: { [QUAD]: weekly } }))
        .eligible,
    ).toBe(false)
  })
  it('is deterministic', () => {
    const a = scoreCandidate(prefs(), cand())
    const b = scoreCandidate(prefs(), cand())
    expect(a).toEqual(b)
  })
})

describe('rankCandidates', () => {
  it('orders best first, drops the impossible, and breaks ties steadily', () => {
    const list = [
      cand({ propertyId: 1, priceByType: { [QUAD]: 3300 } }),
      cand({ propertyId: 2 }),
      cand({ propertyId: 3, availableBeds: 0 }),
      cand({ propertyId: 4 }),
      cand({ propertyId: 5, priceByType: { [QUAD]: 9000 } }),
    ]
    const { ranked, excluded } = rankCandidates(prefs(), list)
    expect(ranked.map((r) => r.candidate.propertyId)).toEqual([2, 4, 1])
    expect(excluded).toBe(2)
  })
  it('a paid boost cannot change the fit: boosting is not even an input', () => {
    const a = scoreCandidate(prefs(), cand({ propertyId: 1 }))
    const boostedShape = {
      ...cand({ propertyId: 1 }),
      boosted: true,
    } as Candidate
    expect(scoreCandidate(prefs(), boostedShape)).toEqual(a)
  })
})
