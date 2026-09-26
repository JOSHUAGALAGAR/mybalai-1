import 'server-only'

import { unstable_cache } from 'next/cache'

import * as discoveryRepo from '@/repositories/discovery.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import { liveBoostedIds } from '@/services/boosts.service'

/** What the public landing page may show about a listing: no owner, no contact details. */
export type FeaturedProperty = {
  propertyId: number
  name: string
  address: string
  typeName: string | null
  imageUrl: string | null
  fromPrice: number | null
  fromPeriod: string | null
  ratingAvg: number | null
  ratingCount: number
  /** The landlord paid to have this listing shown first. */
  boosted: boolean
}

const PRIOR_RATING = 3.8
const PRIOR_WEIGHT = 3

/** Rating pulled toward the middle for listings with few reviews, so one 5-star review does not win. */
const shrunkRating = (avg: number | null, count: number) =>
  (count * (avg ?? 0) + PRIOR_WEIGHT * PRIOR_RATING) / (count + PRIOR_WEIGHT)

/**
 * The listings to show off on the landing page: paid boosts first, then the best-reviewed, then the newest.
 * Only active listings that have a photo or a rate are worth showing; they are picked from the same
 * visible set as the tenant's search, in four queries however many listings there are.
 */
export async function buildFeaturedProperties(
  limit = 6,
): Promise<FeaturedProperty[]> {
  const properties = await discoveryRepo.listVisibleProperties({})
  if (properties.length === 0) return []
  const ids = properties.map((p) => p.property_id)

  const [rates, ratings, types, boosted] = await Promise.all([
    discoveryRepo.listActiveRates(ids),
    discoveryRepo.listRatings(ids),
    referenceRepo.listPropertyTypes(),
    liveBoostedIds(),
  ])
  const typeName = new Map(types.map((t) => [t.property_type_id, t.type_name]))

  const priceOf = new Map<number, { price: number; period: string }>()
  const byProperty = new Map<number, typeof rates>()
  for (const r of rates) {
    byProperty.set(r.property_id, [...(byProperty.get(r.property_id) ?? []), r])
  }
  for (const [id, list] of byProperty) {
    const monthly = list.filter((r) => r.period === 'monthly')
    const pool = monthly.length > 0 ? monthly : list
    const cheapest = pool.reduce((a, b) =>
      Number(b.price) < Number(a.price) ? b : a,
    )
    priceOf.set(id, { price: Number(cheapest.price), period: cheapest.period })
  }
  const stars = new Map<number, number[]>()
  for (const r of ratings) {
    stars.set(r.property_id, [...(stars.get(r.property_id) ?? []), r.rating])
  }

  const cards: FeaturedProperty[] = properties.map((p) => {
    const s = stars.get(p.property_id) ?? []
    const avg = s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : null
    const price = priceOf.get(p.property_id)
    return {
      propertyId: p.property_id,
      name: p.property_name,
      address: p.address,
      typeName:
        p.property_type_id != null
          ? (typeName.get(p.property_type_id) ?? null)
          : null,
      imageUrl: p.property_image,
      fromPrice: price?.price ?? null,
      fromPeriod: price?.period ?? null,
      ratingAvg: avg === null ? null : Math.round(avg * 10) / 10,
      ratingCount: s.length,
      boosted: boosted.has(p.property_id),
    }
  })

  const created = new Map(properties.map((p) => [p.property_id, p.created_at]))
  return cards
    .filter((c) => c.imageUrl !== null || c.fromPrice !== null)
    .sort(
      (a, b) =>
        Number(b.boosted) - Number(a.boosted) ||
        shrunkRating(b.ratingAvg, b.ratingCount) -
          shrunkRating(a.ratingAvg, a.ratingCount) ||
        (created.get(b.propertyId) ?? '').localeCompare(
          created.get(a.propertyId) ?? '',
        ),
    )
    .slice(0, Math.max(1, Math.min(limit, 12)))
}

/** Public and shared by every visitor, so it is built at most every five minutes. */
const cachedFeatured = unstable_cache(
  () => buildFeaturedProperties(6),
  ['landing-featured-properties'],
  { revalidate: 300, tags: ['landing-featured'] },
)

/** Never let a database problem take the landing page down: no listings just hides the section's cards. */
export async function getFeaturedProperties(): Promise<FeaturedProperty[]> {
  try {
    return await cachedFeatured()
  } catch (error) {
    console.error('[landing] featured properties unavailable:', error)
    return []
  }
}
