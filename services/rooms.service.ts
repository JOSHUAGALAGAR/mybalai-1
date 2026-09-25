import 'server-only'

import * as bedsRepo from '@/repositories/beds.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import { isSuperadmin } from '@/lib/permissions/properties'
import {
  explainMissingAdvanceColumns,
  onlyEnabledRequirements,
} from '@/lib/db-errors'
import { parseOrThrow } from '@/services/errors'
import {
  requireManageableProperty,
  requireManageableRoom,
  requireOperableRoom,
} from '@/services/property-access'
import * as subscriptions from '@/services/subscriptions.service'
import {
  DEFAULT_ROOM_STATUS,
  roomRequirementsSchema,
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
    ...(data.require_advance !== undefined && {
      require_advance: data.require_advance,
    }),
    ...(data.require_deposit !== undefined && {
      require_deposit: data.require_deposit,
    }),
    // Photos are managed in the gallery, which keeps the cover here; only touch it when a URL is sent.
    ...(data.room_image !== undefined && { room_image: data.room_image }),
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

  return roomsRepo
    .insertRoom({
      ...onlyEnabledRequirements(toWriteValues(data)),
      property_id: propertyId,
      status_id: statusId,
    })
    .catch(explainMissingAdvanceColumns)
}

/** Change only the advance / deposit switches of a room (nothing else about it is touched). */
export async function updateRoomRequirements(
  propertyId: number,
  roomId: number,
  input: unknown,
): Promise<roomsRepo.RoomRow> {
  await requireManageableRoom(propertyId, roomId)
  const data = parseOrThrow(roomRequirementsSchema, input)
  return roomsRepo
    .updateRoom(roomId, {
      require_advance: data.require_advance,
      require_deposit: data.require_deposit,
    })
    .catch(explainMissingAdvanceColumns)
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

  return roomsRepo
    .updateRoom(roomId, values)
    .catch(explainMissingAdvanceColumns)
}

export async function deleteRoom(
  propertyId: number,
  roomId: number,
): Promise<void> {
  await requireManageableRoom(propertyId, roomId)
  await roomsRepo.softDeleteRoom(roomId)
}
