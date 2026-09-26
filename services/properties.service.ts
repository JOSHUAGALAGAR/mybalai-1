import 'server-only'

import { requireUser, type CurrentUser } from '@/lib/auth/dal'
import {
  canCreateProperty,
  isLandlord,
  isSuperadmin,
} from '@/lib/permissions/properties'
import * as imagesRepo from '@/repositories/property-images.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import * as bedsRepo from '@/repositories/beds.repository'
import * as ratesRepo from '@/repositories/rental-rates.repository'
import { parsePhPhone } from '@/lib/phone'
import {
  explainMissingAdvanceColumns,
  onlyEnabledRequirements,
} from '@/lib/db-errors'
import { ServiceError, parseOrThrow } from '@/services/errors'
import { requireManageableProperty } from '@/services/property-access'
import type { TablesUpdate } from '@/types/database'
import {
  DEFAULT_NEW_PROPERTY_STATUS,
  amenitiesFormSchema,
  propertyFormSchema,
} from '@/schemas/property'

export type PropertyListScope = 'all' | 'mine'

export async function listPropertiesForUser(
  user: CurrentUser,
  scope: PropertyListScope = 'all',
): Promise<propertiesRepo.PropertyRow[]> {
  const restrictToOwn =
    scope === 'mine' || (isLandlord(user) && !isSuperadmin(user))
  return propertiesRepo.listProperties(
    restrictToOwn ? { ownerId: user.legacyUserId } : {},
  )
}

export type PropertyCardExtras = { roomCount: number; photos: string[] }

/**
 * What a list card shows besides the property itself: how many rooms, and its photos (cover
 * first). Two queries for the whole list. Never fails the page: missing photo tables just mean
 * no photos.
 */
export async function getPropertyCardExtras(
  propertyIds: number[],
  legacyCovers: Map<number, string | null> = new Map(),
): Promise<Map<number, PropertyCardExtras>> {
  const [counts, galleries] = await Promise.all([
    roomsRepo.countRoomsByProperties(propertyIds).catch((error) => {
      console.error('[properties] room counts unavailable:', error)
      return new Map<number, number>()
    }),
    imagesRepo.listUrlsByOwners('property', propertyIds).catch((error) => {
      console.error('[properties] photos unavailable:', error)
      return new Map<number, string[]>()
    }),
  ])
  return new Map(
    propertyIds.map((id) => {
      const photos = galleries.get(id) ?? []
      const legacy = legacyCovers.get(id)
      return [
        id,
        {
          roomCount: counts.get(id) ?? 0,
          // a cover pasted the old way (before photo uploads) still shows
          photos: photos.length > 0 ? photos : legacy ? [legacy] : [],
        },
      ]
    }),
  )
}

export async function getPropertyFormOptions() {
  const [types, statuses, amenities] = await Promise.all([
    referenceRepo.listPropertyTypes(),
    referenceRepo.listPropertyStatuses(),
    referenceRepo.listAmenities(),
  ])
  return { types, statuses, amenities }
}

export async function getPropertyOverview(propertyId: number) {
  const { property } = await requireManageableProperty(propertyId)
  const [rooms, rates, amenityIds] = await Promise.all([
    roomsRepo.listRoomsByProperty(propertyId),
    ratesRepo.listRatesByProperty(propertyId),
    propertiesRepo.getPropertyAmenityIds(propertyId),
  ])
  const beds = await bedsRepo.listBedsByProperty(propertyId)
  return { property, rooms, beds, rates, amenityIds }
}

function toWriteValues(data: ReturnType<typeof propertyFormSchema.parse>) {
  return {
    property_name: data.property_name,
    address: data.address,
    property_type_id: data.property_type_id ?? null,
    monthly_payment_rule: data.monthly_payment_rule ?? null,
    booking_policy: data.booking_policy ?? null,
    description: data.description ?? null,
    house_rules: data.house_rules ?? null,
    contact_number: data.contact_number ?? null,
    // Photos are managed in the gallery, which keeps the cover here; only touch it when a URL is sent.
    ...(data.property_image !== undefined && {
      property_image: data.property_image,
    }),
    // Only written when the form/API states them, so other callers never reset them.
    ...(data.require_advance !== undefined && {
      require_advance: data.require_advance,
    }),
    ...(data.require_deposit !== undefined && {
      require_deposit: data.require_deposit,
    }),
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    google_place_id: data.google_place_id ?? null,
  }
}

export async function createProperty(
  input: unknown,
): Promise<propertiesRepo.PropertyRow> {
  const user = await requireUser()
  if (!canCreateProperty(user)) {
    throw new ServiceError(
      'You do not have permission to create properties.',
      'forbidden',
    )
  }

  const data = parseOrThrow(propertyFormSchema, input)

  const statusId = await referenceRepo.resolveStatusId(
    'property_statuses',
    DEFAULT_NEW_PROPERTY_STATUS,
  )

  // A new property starts with both switches off, so only "on" needs writing (this also keeps
  // creating a plain property working on a database that has not had migration 0014 yet).
  return propertiesRepo
    .insertProperty({
      ...onlyEnabledRequirements(toWriteValues(data)),
      property_owner: user.legacyUserId,
      status_id: statusId,
    })
    .catch(explainMissingAdvanceColumns)
}

export async function updateProperty(
  propertyId: number,
  input: unknown,
): Promise<propertiesRepo.PropertyRow> {
  const { property } = await requireManageableProperty(propertyId)

  // A contact number saved before phone checking existed may not be valid. If the landlord did
  // not change it, keep it as it is instead of blocking every other edit; a NEW or changed
  // number is always checked.
  const stored = property.contact_number?.trim() ?? ''
  const submitted =
    typeof input === 'object' && input !== null
      ? String((input as Record<string, unknown>).contact_number ?? '').trim()
      : ''
  const keepLegacyNumber =
    stored !== '' && submitted === stored && !parsePhPhone(stored).ok

  const data = parseOrThrow(
    propertyFormSchema,
    keepLegacyNumber
      ? { ...(input as object), contact_number: undefined }
      : input,
  )

  const values: TablesUpdate<'properties'> = {
    ...toWriteValues(data),
    ...(keepLegacyNumber && { contact_number: stored }),
  }

  if (data.status_code) {
    values.status_id = await referenceRepo.resolveStatusId(
      'property_statuses',
      data.status_code,
    )
  }

  return propertiesRepo
    .updateProperty(propertyId, values)
    .catch(explainMissingAdvanceColumns)
}

export async function archiveProperty(propertyId: number): Promise<void> {
  await requireManageableProperty(propertyId)
  await propertiesRepo.softDeleteProperty(propertyId)
}

export async function setPropertyAmenities(
  propertyId: number,
  input: unknown,
): Promise<void> {
  await requireManageableProperty(propertyId)
  const { amenity_ids } = parseOrThrow(amenitiesFormSchema, input)
  await propertiesRepo.setPropertyAmenities(propertyId, amenity_ids)
}
