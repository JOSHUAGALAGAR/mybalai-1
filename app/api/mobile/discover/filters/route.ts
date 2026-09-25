import { mobileRoute } from '@/lib/api/mobile'
import { getDiscoveryFilters } from '@/services/discovery.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute(async () => {
  const { types, amenities } = await getDiscoveryFilters()
  return {
    types: types.map((t) => ({ id: t.property_type_id, name: t.type_name })),
    amenities: amenities.map((a) => ({
      id: a.amenity_id,
      name: a.amenity_name,
      category: a.category_name ?? 'Other',
    })),
  }
})
