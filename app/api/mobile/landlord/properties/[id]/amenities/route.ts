import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { setPropertyAmenities } from '@/services/properties.service'

export const dynamic = 'force-dynamic'

/** Body: `{ amenity_ids: number[] }` — replaces the property's amenities. */
export const PUT = mobileRoute<{ id: string }>(
  async ({ request, params }) => {
    await setPropertyAmenities(idParam(params.id), await readJson(request))
    return { ok: true }
  },
  { roles: ['landlord'] },
)
