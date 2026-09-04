import 'server-only'

import { requireUser, type CurrentUser } from '@/lib/auth/dal'
import { canManageProperty } from '@/lib/permissions/properties'
import * as bedsRepo from '@/repositories/beds.repository'
import * as caretakersRepo from '@/repositories/caretakers.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as ratesRepo from '@/repositories/rental-rates.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import { ServiceError } from '@/services/errors'

/**
 * Authorization gates for the property module. Every path goes through one of
 * these so authz lives in one place. Rooms, beds, and rates inherit from their
 * property.
 *
 * "manage" = owner (landlord) or superadmin — full CRUD.
 * "operate" = manage OR a caretaker with an ACTIVE assignment — read + a
 *             narrow set of operational status updates (spec §38.3, §45).
 */

export type PropertyContext = {
  user: CurrentUser
  property: propertiesRepo.PropertyRow
}

export async function requireManageableProperty(
  propertyId: number,
): Promise<PropertyContext> {
  const user = await requireUser()
  const property = await propertiesRepo.getProperty(propertyId)
  if (!property) {
    throw new ServiceError('Property not found.', 'not_found')
  }
  if (!canManageProperty(user, property)) {
    throw new ServiceError(
      'You do not have permission to manage this property.',
      'forbidden',
    )
  }
  return { user, property }
}

export async function requireManageableRoom(
  propertyId: number,
  roomId: number,
): Promise<PropertyContext & { room: roomsRepo.RoomRow }> {
  const ctx = await requireManageableProperty(propertyId)
  const room = await roomsRepo.getRoom(roomId)
  if (!room || room.property_id !== propertyId) {
    throw new ServiceError('Room not found.', 'not_found')
  }
  return { ...ctx, room }
}

export async function requireManageableBed(
  propertyId: number,
  roomId: number,
  bedId: number,
): Promise<
  PropertyContext & { room: roomsRepo.RoomRow; bed: bedsRepo.BedRow }
> {
  const ctx = await requireManageableRoom(propertyId, roomId)
  const bed = await bedsRepo.getBed(bedId)
  if (!bed || bed.room_id !== roomId) {
    throw new ServiceError('Bed not found.', 'not_found')
  }
  return { ...ctx, bed }
}

export async function requireManageableRate(
  propertyId: number,
  rateId: number,
): Promise<PropertyContext & { rate: ratesRepo.RentalRateRow }> {
  const ctx = await requireManageableProperty(propertyId)
  const rate = await ratesRepo.getRate(rateId)
  if (!rate || rate.property_id !== propertyId) {
    throw new ServiceError('Rental rate not found.', 'not_found')
  }
  return { ...ctx, rate }
}

/* ------------------------------------------------------------------ *
 * "operate" gates — owner/superadmin OR active caretaker assignment
 * ------------------------------------------------------------------ */

export async function requireOperableProperty(
  propertyId: number,
): Promise<PropertyContext> {
  const user = await requireUser()
  const property = await propertiesRepo.getProperty(propertyId)
  if (!property) {
    throw new ServiceError('Property not found.', 'not_found')
  }

  if (canManageProperty(user, property)) return { user, property }

  if (user.roles.includes('caretaker')) {
    const assigned = await caretakersRepo.isPropertyAssigned(
      user.legacyUserId,
      propertyId,
    )
    if (assigned) return { user, property }
  }

  // Do not reveal existence to a caretaker who is not assigned.
  throw new ServiceError('Property not found.', 'not_found')
}

export async function requireOperableRoom(
  propertyId: number,
  roomId: number,
): Promise<PropertyContext & { room: roomsRepo.RoomRow }> {
  const ctx = await requireOperableProperty(propertyId)
  const room = await roomsRepo.getRoom(roomId)
  if (!room || room.property_id !== propertyId) {
    throw new ServiceError('Room not found.', 'not_found')
  }
  return { ...ctx, room }
}

export async function requireOperableBed(
  propertyId: number,
  roomId: number,
  bedId: number,
): Promise<
  PropertyContext & { room: roomsRepo.RoomRow; bed: bedsRepo.BedRow }
> {
  const ctx = await requireOperableRoom(propertyId, roomId)
  const bed = await bedsRepo.getBed(bedId)
  if (!bed || bed.room_id !== roomId) {
    throw new ServiceError('Bed not found.', 'not_found')
  }
  return { ...ctx, bed }
}
