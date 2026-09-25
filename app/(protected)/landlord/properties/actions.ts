'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import * as beds from '@/services/beds.service'
import * as properties from '@/services/properties.service'
import * as rates from '@/services/rental-rates.service'
import * as rooms from '@/services/rooms.service'
import { ServiceError } from '@/services/errors'

export type MutationState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      values?: Record<string, string>
    }
  | { status: 'success'; message: string; entityId?: number }
  | undefined

function toObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

function toErrorState(
  error: unknown,
  values?: Record<string, string>,
): MutationState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
      values,
    }
  }
  console.error('[landlord/properties] action failed:', error)
  return {
    status: 'error',
    message: 'Something went wrong. Please try again.',
    values,
  }
}

function intField(formData: FormData, name: string): number {
  const value = Number(formData.get(name))
  if (!Number.isInteger(value) || value <= 0) {
    throw new ServiceError('Invalid request.', 'validation')
  }
  return value
}

/** The form sends `image_count` = how many photos the browser is about to upload. */
const wantsPhotos = (values: Record<string, string>) =>
  Number(values.image_count) > 0

const propBase = (id: number) => `/landlord/properties/${id}`

/* ------------------------------------------------------------------ *
 * Property
 * ------------------------------------------------------------------ */

export async function createPropertyAction(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const values = toObject(formData)
  let newId: number
  try {
    newId = (await properties.createProperty(values)).property_id
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath('/landlord/properties')
  // Photos are picked in the browser and uploaded after the property exists, so hand back its id.
  if (wantsPhotos(values)) {
    return { status: 'success', message: 'Property created.', entityId: newId }
  }
  redirect(propBase(newId))
}

export async function updatePropertyAction(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const values = toObject(formData)
  const propertyId = Number(values.property_id)
  try {
    await properties.updateProperty(propertyId, values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath('/landlord/properties')
  revalidatePath(propBase(propertyId))
  redirect(propBase(propertyId))
}

export async function archivePropertyAction(formData: FormData): Promise<void> {
  const propertyId = intField(formData, 'property_id')
  await properties.archiveProperty(propertyId)
  revalidatePath('/landlord/properties')
  redirect('/landlord/properties')
}

export async function saveAmenitiesAction(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const propertyId = Number(formData.get('property_id'))
  const amenity_ids = formData.getAll('amenity_ids').map(String)
  try {
    await properties.setPropertyAmenities(propertyId, { amenity_ids })
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath(propBase(propertyId))
  return { status: 'success', message: 'Amenities updated.' }
}

/* ------------------------------------------------------------------ *
 * Rooms
 * ------------------------------------------------------------------ */

export async function createRoomAction(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const values = toObject(formData)
  const propertyId = Number(values.property_id)
  let roomId: number
  try {
    roomId = (await rooms.createRoom(propertyId, values)).room_id
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath(propBase(propertyId))
  if (wantsPhotos(values)) {
    return { status: 'success', message: 'Room created.', entityId: roomId }
  }
  redirect(`${propBase(propertyId)}/rooms/${roomId}`)
}

export async function updateRoomAction(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const values = toObject(formData)
  const propertyId = Number(values.property_id)
  const roomId = Number(values.room_id)
  try {
    await rooms.updateRoom(propertyId, roomId, values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath(`${propBase(propertyId)}/rooms/${roomId}`)
  redirect(`${propBase(propertyId)}/rooms/${roomId}`)
}

export async function deleteRoomAction(formData: FormData): Promise<void> {
  const propertyId = intField(formData, 'property_id')
  const roomId = intField(formData, 'room_id')
  await rooms.deleteRoom(propertyId, roomId)
  revalidatePath(propBase(propertyId))
  redirect(propBase(propertyId))
}

/* ------------------------------------------------------------------ *
 * Beds (inline on the room page)
 * ------------------------------------------------------------------ */

export async function addBedAction(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const values = toObject(formData)
  const propertyId = Number(values.property_id)
  const roomId = Number(values.room_id)
  try {
    await beds.createBed(propertyId, roomId, values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath(`${propBase(propertyId)}/rooms/${roomId}`)
  return { status: 'success', message: 'Bed added.' }
}

export async function updateBedStatusAction(formData: FormData): Promise<void> {
  const propertyId = intField(formData, 'property_id')
  const roomId = intField(formData, 'room_id')
  const bedId = intField(formData, 'bed_id')
  await beds.updateBedStatus(propertyId, roomId, bedId, {
    status_code: String(formData.get('status_code')),
  })
  revalidatePath(`${propBase(propertyId)}/rooms/${roomId}`)
}

export async function deleteBedAction(formData: FormData): Promise<void> {
  const propertyId = intField(formData, 'property_id')
  const roomId = intField(formData, 'room_id')
  const bedId = intField(formData, 'bed_id')
  await beds.deleteBed(propertyId, roomId, bedId)
  revalidatePath(`${propBase(propertyId)}/rooms/${roomId}`)
}

/* ------------------------------------------------------------------ *
 * Rental rates (inline on the property page)
 * ------------------------------------------------------------------ */

export async function createRateAction(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const values = toObject(formData)
  const propertyId = Number(values.property_id)
  try {
    await rates.createRate(propertyId, values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath(propBase(propertyId))
  return { status: 'success', message: 'Rate added.' }
}

export async function updateRateAction(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const values = toObject(formData)
  const propertyId = Number(values.property_id)
  const rateId = Number(values.rate_id)
  try {
    await rates.updateRate(propertyId, rateId, values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath(propBase(propertyId))
  return { status: 'success', message: 'Rate updated.' }
}

export async function deleteRateAction(formData: FormData): Promise<void> {
  const propertyId = intField(formData, 'property_id')
  const rateId = intField(formData, 'rate_id')
  await rates.deleteRate(propertyId, rateId)
  revalidatePath(propBase(propertyId))
}
