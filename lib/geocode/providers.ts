/**
 * Address search and reverse lookup on OpenStreetMap data (no API key).
 *
 * Photon (komoot) is built for search-as-you-type; Nominatim is the fallback if Photon is down.
 * Both are public, fair-use servers, so callers must cache and rate-limit (see the geocoding
 * service) and every request identifies itself. Results are limited to the Philippines.
 * `fetch` is injected so this stays testable without the network.
 */

export type Place = {
  /** Stable enough to key a list: `osm:<type>:<id>` */
  id: string
  /** One line a landlord recognises: "Session Road, District 10, Baguio, Cordillera…" */
  label: string
  lat: number
  lng: number
}

export type Fetcher = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

// Philippines bounding box: minLon,minLat,maxLon,maxLat
const PH_BBOX = '116.9,4.5,127.0,21.5'
const USER_AGENT = 'MyBalai/1.0 (boarding-house listings)'
const TIMEOUT_MS = 6000

const clean = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v).trim().replace(/\s+/g, ' ')
    : ''

/** Join the non-empty, non-duplicate parts of an address. */
export function joinLabel(parts: unknown[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const text = clean(part)
    const key = text.toLowerCase()
    if (text && !seen.has(key)) {
      seen.add(key)
      out.push(text)
    }
  }
  return out.join(', ')
}

const inPhilippines = (lat: number, lng: number) =>
  lat >= 4.5 && lat <= 21.5 && lng >= 116.9 && lng <= 127

const validPoint = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  inPhilippines(lat, lng)

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, unknown>
}

function fromPhoton(data: unknown): Place[] {
  const features = (data as { features?: PhotonFeature[] })?.features ?? []
  const places: Place[] = []
  for (const f of features) {
    const p = f.properties ?? {}
    const [lng, lat] = f.geometry?.coordinates ?? []
    if (!validPoint(lat, lng)) continue
    if (p.countrycode && p.countrycode !== 'PH') continue
    const street = joinLabel([p.housenumber, p.street]).replace(', ', ' ')
    const label = joinLabel([
      p.name,
      street,
      p.district,
      p.city ?? p.county,
      p.state,
    ])
    if (!label) continue
    places.push({
      id: `osm:${clean(p.osm_type) || 'x'}:${clean(p.osm_id) || `${lat},${lng}`}`,
      label,
      lat,
      lng: lng as number,
    })
  }
  return places
}

type NominatimHit = {
  osm_type?: string
  osm_id?: number
  lat?: string
  lon?: string
  display_name?: string
}

function fromNominatim(data: unknown): Place[] {
  const hits = Array.isArray(data) ? (data as NominatimHit[]) : []
  const places: Place[] = []
  for (const h of hits) {
    const lat = Number(h.lat)
    const lng = Number(h.lon)
    const label = clean(h.display_name)
    if (!validPoint(lat, lng) || !label) continue
    places.push({
      id: `osm:${clean(h.osm_type) || 'x'}:${h.osm_id ?? `${lat},${lng}`}`,
      // Nominatim's own line ends with ", Philippines" and a postcode — trim the noise.
      label: label.replace(/,\s*Philippines$/i, ''),
      lat,
      lng,
    })
  }
  return places
}

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetcher(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`geocoder answered ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function searchAddress(
  query: string,
  fetcher: Fetcher,
): Promise<Place[]> {
  const q = encodeURIComponent(query)
  try {
    const photon = fromPhoton(
      await getJson(
        fetcher,
        `https://photon.komoot.io/api/?q=${q}&limit=8&lang=en&bbox=${PH_BBOX}`,
      ),
    )
    if (photon.length > 0) return photon.slice(0, 6)
  } catch {
    // fall through to Nominatim
  }
  return fromNominatim(
    await getJson(
      fetcher,
      `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ph&limit=6&q=${q}`,
    ),
  )
}

/** The nearest address to a dropped pin, or null when nothing useful is there. */
export async function reverseAddress(
  lat: number,
  lng: number,
  fetcher: Fetcher,
): Promise<Place | null> {
  try {
    const found = fromPhoton(
      await getJson(
        fetcher,
        `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&lang=en`,
      ),
    )
    if (found[0]) return { ...found[0], lat, lng }
  } catch {
    // fall through
  }
  try {
    const hit = (await getJson(
      fetcher,
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
    )) as NominatimHit
    const label = clean(hit?.display_name).replace(/,\s*Philippines$/i, '')
    return label
      ? {
          id: `osm:${clean(hit.osm_type) || 'x'}:${hit.osm_id ?? `${lat},${lng}`}`,
          label,
          lat,
          lng,
        }
      : null
  } catch {
    return null
  }
}
