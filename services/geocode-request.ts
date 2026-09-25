import 'server-only'

import { reversePlace, searchPlaces } from '@/services/geocoding.service'
import { ServiceError } from '@/services/errors'

/** `?q=text` → matching places; `?lat=..&lng=..` → the address at a pin. Shared by web and mobile routes. */
export async function runGeocode(params: URLSearchParams) {
  const q = params.get('q')
  if (q !== null) return { places: await searchPlaces(q) }

  const lat = params.get('lat')
  const lng = params.get('lng')
  if (lat !== null && lng !== null) {
    return { place: await reversePlace(Number(lat), Number(lng)) }
  }
  throw new ServiceError('Provide q, or lat and lng.', 'validation')
}
