import 'server-only'

import { requireUser } from '@/lib/auth/dal'
import * as discoveryRepo from '@/repositories/discovery.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as imageService from '@/services/property-images.service'
import { ServiceError } from '@/services/errors'
import { PAGE_SIZE, type DiscoveryQuery } from '@/schemas/discovery'

const PERIOD_ORDER = { monthly: 0, weekly: 1, daily: 2 } as const

type RateInfo = { fromPrice: number | null; fromPeriod: string | null }

function summariseRates(rates: discoveryRepo.RateRow[]): RateInfo {
  if (rates.length === 0) return { fromPrice: null, fromPeriod: null }
  const monthly = rates.filter((r) => r.period === 'monthly')
  const pool = monthly.length > 0 ? monthly : rates
  const cheapest = pool.reduce((a, b) =>
    Number(b.price) < Number(a.price) ? b : a,
  )
  return { fromPrice: Number(cheapest.price), fromPeriod: cheapest.period }
}

function ratingSummary(rows: discoveryRepo.RatingRow[]) {
  if (rows.length === 0) return { avg: null as number | null, count: 0 }
  const sum = rows.reduce((n, r) => n + r.rating, 0)
  return { avg: Math.round((sum / rows.length) * 10) / 10, count: rows.length }
}

export type DiscoveryCard = {
  propertyId: number
  name: string
  address: string
  typeName: string | null
  imageUrl: string | null
  fromPrice: number | null
  fromPeriod: string | null
  amenityCount: number
  ratingAvg: number | null
  ratingCount: number
}

export type DiscoveryResults = {
  items: DiscoveryCard[]
  total: number
  page: number
  pageCount: number
}

export async function getDiscoveryFilters() {
  await requireUser()
  const [types, amenities] = await Promise.all([
    referenceRepo.listPropertyTypes(),
    referenceRepo.listAmenities(),
  ])
  return { types, amenities }
}

export async function searchProperties(
  query: DiscoveryQuery,
): Promise<DiscoveryResults> {
  await requireUser()

  const properties = await discoveryRepo.listVisibleProperties({
    q: query.q,
    typeId: query.type,
  })
  const ids = properties.map((p) => p.property_id)

  const [rates, amenityLinks, ratings, types] = await Promise.all([
    discoveryRepo.listActiveRates(ids),
    discoveryRepo.listAmenityLinks(ids),
    discoveryRepo.listRatings(ids),
    referenceRepo.listPropertyTypes(),
  ])

  const typeName = new Map(types.map((t) => [t.property_type_id, t.type_name]))

  const ratesByProperty = new Map<number, discoveryRepo.RateRow[]>()
  for (const r of rates) {
    const list = ratesByProperty.get(r.property_id) ?? []
    list.push(r)
    ratesByProperty.set(r.property_id, list)
  }

  const amenitiesByProperty = new Map<number, Set<number>>()
  for (const link of amenityLinks) {
    const set = amenitiesByProperty.get(link.property_id) ?? new Set<number>()
    set.add(link.amenity_id)
    amenitiesByProperty.set(link.property_id, set)
  }

  const ratingsByProperty = new Map<number, discoveryRepo.RatingRow[]>()
  for (const row of ratings) {
    const list = ratingsByProperty.get(row.property_id) ?? []
    list.push(row)
    ratingsByProperty.set(row.property_id, list)
  }

  const wantAmenities = new Set(query.amenities)
  const priceOf = (id: number) =>
    summariseRates(ratesByProperty.get(id) ?? []).fromPrice

  const matched = properties.filter((p) => {
    if (wantAmenities.size > 0) {
      const have = amenitiesByProperty.get(p.property_id) ?? new Set<number>()
      for (const id of wantAmenities) if (!have.has(id)) return false
    }
    if (query.min !== undefined || query.max !== undefined) {
      const fromPrice = priceOf(p.property_id)
      if (fromPrice === null) return false
      if (query.min !== undefined && fromPrice < query.min) return false
      if (query.max !== undefined && fromPrice > query.max) return false
    }
    return true
  })

  matched.sort((a, b) => {
    switch (query.sort) {
      case 'price_asc':
        return (
          (priceOf(a.property_id) ?? Infinity) -
          (priceOf(b.property_id) ?? Infinity)
        )
      case 'price_desc':
        return (
          (priceOf(b.property_id) ?? -Infinity) -
          (priceOf(a.property_id) ?? -Infinity)
        )
      case 'name':
        return a.property_name.localeCompare(b.property_name)
      case 'newest':
      default:
        return b.created_at.localeCompare(a.created_at)
    }
  })

  const total = matched.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(query.page, pageCount)
  const start = (page - 1) * PAGE_SIZE

  const items: DiscoveryCard[] = matched
    .slice(start, start + PAGE_SIZE)
    .map((p) => {
      const rateInfo = summariseRates(ratesByProperty.get(p.property_id) ?? [])
      const rs = ratingSummary(ratingsByProperty.get(p.property_id) ?? [])
      return {
        propertyId: p.property_id,
        name: p.property_name,
        address: p.address,
        typeName:
          p.property_type_id != null
            ? (typeName.get(p.property_type_id) ?? null)
            : null,
        imageUrl: p.property_image,
        fromPrice: rateInfo.fromPrice,
        fromPeriod: rateInfo.fromPeriod,
        amenityCount: amenitiesByProperty.get(p.property_id)?.size ?? 0,
        ratingAvg: rs.avg,
        ratingCount: rs.count,
      }
    })

  return { items, total, page, pageCount }
}

/** Photos are a nice-to-have on public pages: never let a gallery problem hide the listing. */
async function galleryOrEmpty<T>(load: Promise<T>, empty: T): Promise<T> {
  try {
    return await load
  } catch (error) {
    console.error('[discovery] photo gallery unavailable:', error)
    return empty
  }
}

export type DiscoveryDetail = Awaited<ReturnType<typeof getDiscoveryDetail>>

export async function getDiscoveryDetail(propertyId: number) {
  await requireUser()

  // One round-trip to the database costs ~300 ms here, so everything that does
  // not depend on another result is started together (was 4 sequential rounds).
  const [
    property,
    types,
    amenityCatalog,
    amenityLinks,
    rooms,
    rates,
    ratings,
    roomTypes,
    roomStatuses,
    bedStatuses,
  ] = await Promise.all([
    discoveryRepo.getVisibleProperty(propertyId),
    referenceRepo.listPropertyTypes(),
    referenceRepo.listAmenities(),
    discoveryRepo.listAmenityLinks([propertyId]),
    discoveryRepo.listRoomsForProperty(propertyId),
    discoveryRepo.listActiveRates([propertyId]),
    discoveryRepo.listRatings([propertyId]),
    referenceRepo.listRoomTypes(),
    referenceRepo.listRoomStatuses(),
    referenceRepo.listBedStatuses(),
  ])
  if (!property) {
    throw new ServiceError('Property not found.', 'not_found')
  }

  const [beds, reviewerName, propertyPhotos, roomPhotos] = await Promise.all([
    discoveryRepo.listBedsForRooms(rooms.map((r) => r.room_id)),
    discoveryRepo.reviewerNames(ratings.map((r) => r.user_id)),
    galleryOrEmpty(
      imageService.publicGallery({ kind: 'property', propertyId }),
      [] as string[],
    ),
    galleryOrEmpty(
      imageService.publicGalleries(
        'room',
        rooms.map((r) => r.room_id),
      ),
      new Map<number, string[]>(),
    ),
  ])

  const selectedAmenityIds = new Set(amenityLinks.map((l) => l.amenity_id))
  const amenityGroups = new Map<string, string[]>()
  for (const a of amenityCatalog) {
    if (!selectedAmenityIds.has(a.amenity_id)) continue
    const key = a.category_name ?? 'Other'
    if (!amenityGroups.has(key)) amenityGroups.set(key, [])
    amenityGroups.get(key)!.push(a.amenity_name)
  }

  const roomTypeName = new Map(
    roomTypes.map((t) => [t.room_type_id, t.room_type_name]),
  )
  const roomStatusName = new Map(
    roomStatuses.map((s) => [s.room_status_id, s.status_name]),
  )
  const availableBedStatusId = bedStatuses.find(
    (s) => s.status_code === 'available',
  )?.bed_status_id

  const bedsByRoom = new Map<number, discoveryRepo.BedRow[]>()
  for (const b of beds) {
    const list = bedsByRoom.get(b.room_id) ?? []
    list.push(b)
    bedsByRoom.set(b.room_id, list)
  }
  const ratesByRoom = new Map<number, discoveryRepo.RateRow[]>()
  for (const r of rates) {
    const list = ratesByRoom.get(r.room_id) ?? []
    list.push(r)
    ratesByRoom.set(r.room_id, list)
  }

  const roomViews = rooms.map((room) => {
    const roomBeds = bedsByRoom.get(room.room_id) ?? []
    const roomRates = (ratesByRoom.get(room.room_id) ?? [])
      .slice()
      .sort(
        (a, b) =>
          (PERIOD_ORDER[a.period as keyof typeof PERIOD_ORDER] ?? 9) -
          (PERIOD_ORDER[b.period as keyof typeof PERIOD_ORDER] ?? 9),
      )
    return {
      roomId: room.room_id,
      label:
        room.room_name || room.room_number
          ? [room.room_name, room.room_number].filter(Boolean).join(' · ')
          : `Room #${room.room_id}`,
      typeName:
        room.room_type_id != null
          ? (roomTypeName.get(room.room_type_id) ?? null)
          : null,
      statusName:
        room.status_id != null
          ? (roomStatusName.get(room.status_id) ?? null)
          : null,
      maxOccupants: room.max_occupants,
      floor: room.floor,
      areaSqm: room.area_sqm,
      photos:
        roomPhotos.get(room.room_id) ??
        (room.room_image ? [room.room_image] : []),
      requireAdvance: room.require_advance === true,
      requireDeposit: room.require_deposit === true,
      bedTotal: roomBeds.length,
      bedAvailable: roomBeds.filter((b) => b.status_id === availableBedStatusId)
        .length,
      rates: roomRates.map((r) => ({
        period: r.period,
        price: Number(r.price),
      })),
    }
  })

  const sum = ratings.reduce((n, r) => n + r.rating, 0)
  const reviews = ratings.slice(0, 8).map((r) => ({
    ratingId: r.rating_id,
    rating: r.rating,
    review: r.review,
    createdAt: r.created_at,
    reviewer: reviewerName.get(r.user_id)?.split(' ')[0] ?? 'A tenant',
    landlordResponse: r.landlord_response,
  }))

  const mapUrl =
    property.latitude != null && property.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`
      : property.google_place_id
        ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${property.google_place_id}`
        : null

  return {
    property,
    typeName:
      property.property_type_id != null
        ? (types.find((t) => t.property_type_id === property.property_type_id)
            ?.type_name ?? null)
        : null,
    amenityGroups: [...amenityGroups.entries()].map(([category, names]) => ({
      category,
      names: names.sort(),
    })),
    // Gallery first; fall back to the single legacy cover for listings created before galleries.
    photos:
      propertyPhotos.length > 0
        ? propertyPhotos
        : property.property_image
          ? [property.property_image]
          : [],
    rooms: roomViews,
    fromPrice: summariseRates(rates),
    ratings: {
      avg: ratings.length ? Math.round((sum / ratings.length) * 10) / 10 : null,
      count: ratings.length,
      reviews,
    },
    mapUrl,
  }
}
