import 'server-only'

import { requireUser, type CurrentUser } from '@/lib/auth/dal'
import {
  canCreateProperty,
  isLandlord,
  isSuperadmin,
} from '@/lib/permissions/properties'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import * as bedsRepo from '@/repositories/beds.repository'
import * as ratesRepo from '@/repositories/rental-rates.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import { requireManageableProperty } from '@/services/property-access'
import * as subscriptions from '@/services/subscriptions.service'
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
    property_image: data.property_image ?? null,
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

  // Subscription cap — the superadmin is not limited.
  if (!isSuperadmin(user)) {
    await subscriptions.assertCanAddProperty(user.legacyUserId)
  }

  const statusId = await referenceRepo.resolveStatusId(
    'property_statuses',
    DEFAULT_NEW_PROPERTY_STATUS,
  )

  return propertiesRepo.insertProperty({
    ...toWriteValues(data),
    property_owner: user.legacyUserId,
    status_id: statusId,
  })
}

export async function updateProperty(
  propertyId: number,
  input: unknown,
): Promise<propertiesRepo.PropertyRow> {
  await requireManageableProperty(propertyId)
  const data = parseOrThrow(propertyFormSchema, input)

  const values: TablesUpdate<'properties'> = {
    ...toWriteValues(data),
  }

  if (data.status_code) {
    values.status_id = await referenceRepo.resolveStatusId(
      'property_statuses',
      data.status_code,
    )
  }

  return propertiesRepo.updateProperty(propertyId, values)
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
