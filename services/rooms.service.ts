import 'server-only'

import * as bedsRepo from '@/repositories/beds.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import { isSuperadmin } from '@/lib/permissions/properties'
import { parseOrThrow } from '@/services/errors'
import {
  requireManageableProperty,
  requireManageableRoom,
  requireOperableRoom,
} from '@/services/property-access'
import * as subscriptions from '@/services/subscriptions.service'
import {
  DEFAULT_ROOM_STATUS,
  roomFormSchema,
  type RoomStatus,
} from '@/schemas/room'
import type { TablesUpdate } from '@/types/database'

export async function getRoomDetail(propertyId: number, roomId: number) {
  const { property, room } = await requireManageableRoom(propertyId, roomId)
  const beds = await bedsRepo.listBedsByRoom(roomId)
  return { property, room, beds }
}

/** Read-side for caretakers (assignment-gated). */
export async function getOperableRoomDetail(
  propertyId: number,
  roomId: number,
) {
  const { property, room } = await requireOperableRoom(propertyId, roomId)
  const beds = await bedsRepo.listBedsByRoom(roomId)
  return { property, room, beds }
}

/** Operational status change — owner/superadmin or an assigned caretaker. */
export async function setRoomStatus(
  propertyId: number,
  roomId: number,
  statusCode: RoomStatus,
): Promise<roomsRepo.RoomRow> {
  await requireOperableRoom(propertyId, roomId)
  const statusId = await referenceRepo.resolveStatusId(
    'room_statuses',
    statusCode,
  )
  return roomsRepo.updateRoom(roomId, { status_id: statusId })
}

export async function getRoomFormOptions() {
  const [types, statuses] = await Promise.all([
    referenceRepo.listRoomTypes(),
    referenceRepo.listRoomStatuses(),
  ])
  return { types, statuses }
}

function toWriteValues(data: ReturnType<typeof roomFormSchema.parse>) {
  return {
    room_number: data.room_number ?? null,
    room_name: data.room_name ?? null,
    room_type_id: data.room_type_id ?? null,
    floor: data.floor ?? null,
    area_sqm: data.area_sqm ?? null,
    max_occupants: data.max_occupants,
    description: data.description ?? null,
    room_image: data.room_image ?? null,
  }
}

export async function createRoom(
  propertyId: number,
  input: unknown,
): Promise<roomsRepo.RoomRow> {
  const { user, property } = await requireManageableProperty(propertyId)
  const data = parseOrThrow(roomFormSchema, input)

  if (!isSuperadmin(user) && property.property_owner != null) {
    await subscriptions.assertCanAddRoom(property.property_owner, propertyId)
  }
  const statusId = await referenceRepo.resolveStatusId(
    'room_statuses',
    data.status_code ?? DEFAULT_ROOM_STATUS,
  )

  return roomsRepo.insertRoom({
    ...toWriteValues(data),
    property_id: propertyId,
    status_id: statusId,
  })
}

export async function updateRoom(
  propertyId: number,
  roomId: number,
  input: unknown,
): Promise<roomsRepo.RoomRow> {
  await requireManageableRoom(propertyId, roomId)
  const data = parseOrThrow(roomFormSchema, input)

  const values: TablesUpdate<'rooms'> = { ...toWriteValues(data) }
  if (data.status_code) {
    values.status_id = await referenceRepo.resolveStatusId(
      'room_statuses',
      data.status_code,
    )
  }

  return roomsRepo.updateRoom(roomId, values)
}

export async function deleteRoom(
  propertyId: number,
  roomId: number,
): Promise<void> {
  await requireManageableRoom(propertyId, roomId)
  await roomsRepo.softDeleteRoom(roomId)
}
