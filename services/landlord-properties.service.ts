import 'server-only'

import { requireUser } from '@/lib/auth/dal'
import * as bedsRepo from '@/repositories/beds.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import { getPropertyOverview } from '@/services/properties.service'
import { listPropertyGalleries } from '@/services/property-images.service'

export type PropertySummary = {
  propertyId: number
  name: string
  address: string
  typeName: string | null
  statusCode: string | null
  statusName: string | null
  imageUrl: string | null
  roomCount: number
  bedCount: number
  bedsAvailable: number
}

/** The signed-in landlord's own properties, with headline counts. */
export async function listMyPropertySummaries(): Promise<PropertySummary[]> {
  const user = await requireUser()
  const [properties, types, statuses, bedStatuses] = await Promise.all([
    propertiesRepo.listProperties({ ownerId: user.legacyUserId }),
    referenceRepo.listPropertyTypes(),
    referenceRepo.listPropertyStatuses(),
    referenceRepo.listBedStatuses(),
  ])
  const availableId = bedStatuses.find(
    (s) => s.status_code === 'available',
  )?.bed_status_id

  return Promise.all(
    properties.map(async (p) => {
      const [rooms, beds] = await Promise.all([
        roomsRepo.listRoomsByProperty(p.property_id),
        bedsRepo.listBedsByProperty(p.property_id),
      ])
      const status = statuses.find((s) => s.property_status_id === p.status_id)
      return {
        propertyId: p.property_id,
        name: p.property_name,
        address: p.address,
        typeName:
          types.find((t) => t.property_type_id === p.property_type_id)
            ?.type_name ?? null,
        statusCode: status?.status_code ?? null,
        statusName: status?.status_name ?? null,
        imageUrl: p.property_image,
        roomCount: rooms.length,
        bedCount: beds.length,
        bedsAvailable: beds.filter((b) => b.status_id === availableId).length,
      }
    }),
  )
}

/** One of the landlord's properties with rooms, beds, rates and chosen amenities. Owner-only. */
export async function getMyPropertyDetail(propertyId: number) {
  const { property, rooms, beds, rates, amenityIds } =
    await getPropertyOverview(propertyId)
  const [types, roomTypes, statuses, bedStatuses] = await Promise.all([
    referenceRepo.listPropertyTypes(),
    referenceRepo.listRoomTypes(),
    referenceRepo.listPropertyStatuses(),
    referenceRepo.listBedStatuses(),
  ])
  const status = statuses.find(
    (s) => s.property_status_id === property.status_id,
  )
  const galleries = await listPropertyGalleries(
    propertyId,
    rooms.map((r) => r.room_id),
  )

  return {
    /** `null` until migration 0013 is applied — the app then hides the photo tools. */
    photosAvailable: galleries !== null,
    property: {
      propertyId: property.property_id,
      name: property.property_name,
      address: property.address,
      typeId: property.property_type_id,
      typeName:
        types.find((t) => t.property_type_id === property.property_type_id)
          ?.type_name ?? null,
      statusCode: status?.status_code ?? null,
      statusName: status?.status_name ?? null,
      description: property.description,
      houseRules: property.house_rules,
      bookingPolicy: property.booking_policy,
      monthlyPaymentRule: property.monthly_payment_rule,
      contactNumber: property.contact_number,
      imageUrl: property.property_image,
      googlePlaceId: property.google_place_id,
      latitude: property.latitude,
      longitude: property.longitude,
      requireAdvance: property.require_advance === true,
      requireDeposit: property.require_deposit === true,
      photos: galleries?.property ?? [],
    },
    amenityIds,
    rooms: rooms.map((room) => ({
      roomId: room.room_id,
      name: room.room_name,
      number: room.room_number,
      typeName:
        roomTypes.find((t) => t.room_type_id === room.room_type_id)
          ?.room_type_name ?? null,
      floor: room.floor,
      maxOccupants: room.max_occupants,
      requireAdvance: room.require_advance === true,
      requireDeposit: room.require_deposit === true,
      photos: galleries?.rooms[room.room_id] ?? [],
      beds: beds
        .filter((b) => b.room_id === room.room_id)
        .map((b) => ({
          bedId: b.bed_id,
          bedNumber: b.bed_number,
          statusName:
            bedStatuses.find((s) => s.bed_status_id === b.status_id)
              ?.status_name ?? null,
        })),
      rates: rates
        .filter((r) => r.room_id === room.room_id)
        .map((r) => ({
          rateId: r.rate_id,
          period: r.period,
          price: Number(r.price),
          validFrom: r.valid_from,
          validUntil: r.valid_until,
        })),
    })),
  }
}

/** Choices for the property / room forms. */
export async function getPropertyFormChoices() {
  await requireUser()
  const [types, roomTypes, amenities] = await Promise.all([
    referenceRepo.listPropertyTypes(),
    referenceRepo.listRoomTypes(),
    referenceRepo.listAmenities(),
  ])
  return {
    types: types.map((t) => ({ id: t.property_type_id, name: t.type_name })),
    roomTypes: roomTypes.map((t) => ({
      id: t.room_type_id,
      name: t.room_type_name,
    })),
    amenities: amenities.map((a) => ({
      id: a.amenity_id,
      name: a.amenity_name,
      category: a.category_name ?? 'Other',
    })),
  }
}
