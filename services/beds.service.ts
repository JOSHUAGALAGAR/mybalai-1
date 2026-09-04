import 'server-only'

import { isSuperadmin } from '@/lib/permissions/properties'
import * as bedsRepo from '@/repositories/beds.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import { parseOrThrow } from '@/services/errors'
import {
  requireManageableBed,
  requireManageableRoom,
  requireOperableBed,
} from '@/services/property-access'
import * as subscriptions from '@/services/subscriptions.service'
import { bedFormSchema, bedStatusSchema } from '@/schemas/bed'

export async function getBedStatuses() {
  return referenceRepo.listBedStatuses()
}

export async function createBed(
  propertyId: number,
  roomId: number,
  input: unknown,
): Promise<bedsRepo.BedRow> {
  const { user, property } = await requireManageableRoom(propertyId, roomId)
  const data = parseOrThrow(bedFormSchema, input)

  if (!isSuperadmin(user) && property.property_owner != null) {
    await subscriptions.assertCanAddBed(property.property_owner, roomId)
  }
  const statusId = await referenceRepo.resolveStatusId(
    'bed_statuses',
    data.status_code,
  )
  return bedsRepo.insertBed({
    room_id: roomId,
    bed_number: data.bed_number,
    status_id: statusId,
  })
}

export async function updateBedStatus(
  propertyId: number,
  roomId: number,
  bedId: number,
  input: unknown,
): Promise<bedsRepo.BedRow> {
  // Owner/superadmin OR an assigned caretaker (spec §38.3).
  await requireOperableBed(propertyId, roomId, bedId)
  const { status_code } = parseOrThrow(bedStatusSchema, input)
  const statusId = await referenceRepo.resolveStatusId(
    'bed_statuses',
    status_code,
  )
  return bedsRepo.updateBed(bedId, { status_id: statusId })
}

export async function deleteBed(
  propertyId: number,
  roomId: number,
  bedId: number,
): Promise<void> {
  await requireManageableBed(propertyId, roomId, bedId)
  await bedsRepo.softDeleteBed(bedId)
}
