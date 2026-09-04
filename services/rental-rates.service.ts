import 'server-only'

import * as ratesRepo from '@/repositories/rental-rates.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import {
  requireManageableProperty,
  requireManageableRate,
} from '@/services/property-access'
import { rentalRateFormSchema } from '@/schemas/rental-rate'

async function assertRoomInProperty(propertyId: number, roomId: number) {
  const room = await roomsRepo.getRoom(roomId)
  if (!room || room.property_id !== propertyId) {
    throw new ServiceError(
      'That room does not belong to this property.',
      'validation',
      { room_id: ['Select a room in this property.'] },
    )
  }
}

export async function createRate(
  propertyId: number,
  input: unknown,
): Promise<ratesRepo.RentalRateRow> {
  await requireManageableProperty(propertyId)
  const data = parseOrThrow(rentalRateFormSchema, input)
  await assertRoomInProperty(propertyId, data.room_id)

  return ratesRepo.insertRate({
    property_id: propertyId,
    room_id: data.room_id,
    period: data.period,
    price: data.price,
    valid_from: data.valid_from,
    valid_until: data.valid_until ?? null,
  })
}

export async function updateRate(
  propertyId: number,
  rateId: number,
  input: unknown,
): Promise<ratesRepo.RentalRateRow> {
  await requireManageableRate(propertyId, rateId)
  const data = parseOrThrow(rentalRateFormSchema, input)
  await assertRoomInProperty(propertyId, data.room_id)

  return ratesRepo.updateRate(rateId, {
    room_id: data.room_id,
    period: data.period,
    price: data.price,
    valid_from: data.valid_from,
    valid_until: data.valid_until ?? null,
  })
}

export async function deleteRate(
  propertyId: number,
  rateId: number,
): Promise<void> {
  await requireManageableRate(propertyId, rateId)
  await ratesRepo.softDeleteRate(rateId)
}
