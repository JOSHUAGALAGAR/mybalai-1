import 'server-only'

import * as bedsRepo from '@/repositories/beds.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as ratesRepo from '@/repositories/rental-rates.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import { firstBatchProblem, roomBatchSchema } from '@/schemas/room-batch'
import {
  explainMissingAdvanceColumns,
  onlyEnabledRequirements,
} from '@/lib/db-errors'
import { ServiceError, parseOrThrow } from '@/services/errors'
import {
  requireManageableProperty,
  requireManageableRoom,
  requireOperableRoom,
} from '@/services/property-access'
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
  await requireManageableProperty(propertyId)
  const data = parseOrThrow(roomFormSchema, input)

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

/* ------------------------------------------------------------------ *
 * Batch: many rooms (with their beds and rates) from one JSON draft
 * ------------------------------------------------------------------ */

export type RoomBatchResult = {
  rooms: number
  beds: number
  rates: number
  /** Ids of the new rooms, in the order of the draft (the browser uploads each room's photos to its id). */
  roomIds: number[]
}

/**
 * Save a whole draft in three requests (rooms, beds, rates) instead of one page load per room.
 * If a later step fails, the rooms just created are taken back off so nothing half-done is left.
 */
export async function createRoomsBatch(
  propertyId: number,
  input: unknown,
): Promise<RoomBatchResult> {
  await requireManageableProperty(propertyId)
  const parsed = roomBatchSchema.safeParse(input)
  if (!parsed.success) {
    throw new ServiceError(
      firstBatchProblem(parsed.error, 'Room'),
      'validation',
    )
  }
  const drafts = parsed.data.rooms

  const [roomStatusId, bedStatusId] = await Promise.all([
    referenceRepo.resolveStatusId('room_statuses', DEFAULT_ROOM_STATUS),
    referenceRepo.resolveStatusId('bed_statuses', 'available'),
  ])

  const created = await roomsRepo
    .insertRooms(
      drafts.map((d) => ({
        ...onlyEnabledRequirements({
          room_number: d.room_number ?? null,
          room_name: d.room_name ?? null,
          room_type_id: d.room_type_id ?? null,
          floor: d.floor ?? null,
          area_sqm: d.area_sqm ?? null,
          max_occupants: d.max_occupants,
          description: d.description ?? null,
          require_advance: d.require_advance,
          require_deposit: d.require_deposit,
        }),
        property_id: propertyId,
        status_id: roomStatusId,
      })),
    )
    .catch(explainMissingAdvanceColumns)

  // `insert ... returning` keeps input order, so rooms[i] is drafts[i].
  const beds = created.flatMap((room, i) =>
    Array.from({ length: drafts[i].beds }, (_, n) => ({
      room_id: room.room_id,
      bed_number: String(n + 1),
      status_id: bedStatusId,
    })),
  )
  const rates = created.flatMap((room, i) =>
    drafts[i].rates.map((rate) => ({
      property_id: propertyId,
      room_id: room.room_id,
      period: rate.period,
      price: rate.price,
      valid_from: rate.valid_from,
      valid_until: rate.valid_until ?? null,
    })),
  )

  try {
    await bedsRepo.insertBeds(beds)
    await ratesRepo.insertRates(rates)
  } catch (error) {
    await roomsRepo
      .softDeleteRooms(created.map((r) => r.room_id))
      .catch((rollback) =>
        console.error('[rooms] batch rollback failed:', rollback),
      )
    throw error
  }
  return {
    rooms: created.length,
    beds: beds.length,
    rates: rates.length,
    roomIds: created.map((r) => r.room_id),
  }
}
