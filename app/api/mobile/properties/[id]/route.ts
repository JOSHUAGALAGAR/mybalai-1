import { idParam, mobileRoute } from '@/lib/api/mobile'
import { getDiscoveryDetail } from '@/services/discovery.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute<{ id: string }>(async ({ params }) => {
  const detail = await getDiscoveryDetail(idParam(params.id))
  const { property } = detail

  // Project only what the app shows; never hand the raw row (owner id, etc.).
  return {
    property: {
      propertyId: property.property_id,
      name: property.property_name,
      address: property.address,
      description: property.description,
      houseRules: property.house_rules,
      bookingPolicy: property.booking_policy,
      contactNumber: property.contact_number,
      imageUrl: property.property_image,
      latitude: property.latitude,
      longitude: property.longitude,
      isVerified: property.is_verified,
    },
    // The gallery (cover first); falls back to the single cover photo of older listings.
    photos: detail.photos,
    typeName: detail.typeName,
    amenityGroups: detail.amenityGroups,
    rooms: detail.rooms,
    fromPrice: detail.fromPrice,
    ratings: detail.ratings,
    mapUrl: detail.mapUrl,
  }
})
