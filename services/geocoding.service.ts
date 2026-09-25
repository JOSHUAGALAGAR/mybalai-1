import 'server-only'

import { requireUser } from '@/lib/auth/dal'
import {
  reverseAddress,
  searchAddress,
  type Fetcher,
  type Place,
} from '@/lib/geocode/providers'
import { ServiceError } from '@/services/errors'

/**
 * Address lookup for the landlord's "Address" field. Only landlords / superadmins may use it
 * (it spends a shared, free public service), each user is limited per minute, and answers are
 * cached briefly so typing the same thing twice costs nothing.
 */

const MAX_QUERY = 200
const LIMIT_PER_MINUTE = 40
const CACHE_TTL_MS = 10 * 60_000
const CACHE_MAX = 300

const hits = new Map<number, number[]>()
const cache = new Map<string, { at: number; value: unknown }>()

async function requireLandlord() {
  const user = await requireUser()
  if (!user.roles.includes('landlord') && !user.roles.includes('superadmin')) {
    throw new ServiceError('Only landlords can search addresses.', 'forbidden')
  }
  return user
}

function throttle(userId: number, now = Date.now()) {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= LIMIT_PER_MINUTE) {
    throw new ServiceError(
      'Too many searches. Wait a moment and try again.',
      'conflict',
    )
  }
  recent.push(now)
  hits.set(userId, recent)
}

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value as T
  const value = await load()
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: now, value })
  return value
}

const realFetch: Fetcher = (url, init) => fetch(url, init)

export async function searchPlaces(
  rawQuery: string,
  fetcher: Fetcher = realFetch,
): Promise<Place[]> {
  const user = await requireLandlord()
  const query = rawQuery.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY)
  if (query.length < 3) return []
  throttle(user.legacyUserId)
  try {
    return await cached(`s:${query.toLowerCase()}`, () =>
      searchAddress(query, fetcher),
    )
  } catch (error) {
    console.error('[geocode] search failed:', error)
    throw new ServiceError(
      'Address search is unavailable right now. You can still drop a pin on the map.',
      'conflict',
    )
  }
}

export async function reversePlace(
  lat: number,
  lng: number,
  fetcher: Fetcher = realFetch,
): Promise<Place | null> {
  const user = await requireLandlord()
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new ServiceError('Invalid location.', 'validation')
  }
  throttle(user.legacyUserId)
  // ~11 m grid, so a nudged pin re-uses the answer
  const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}`
  return cached(key, () => reverseAddress(lat, lng, fetcher))
}
