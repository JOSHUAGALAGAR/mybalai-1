'use server'

import { revalidatePath } from 'next/cache'

import { ServiceError } from '@/services/errors'
import * as rooms from '@/services/rooms.service'
import type { RoomStatus } from '@/schemas/room'

// Bed-status changes reuse the landlord action (its service gate already allows
// an assigned caretaker). Room status gets its own thin action here.

export async function setRoomStatusAction(formData: FormData): Promise<void> {
  const propertyId = Number(formData.get('property_id'))
  const roomId = Number(formData.get('room_id'))
  const statusCode = String(formData.get('status_code')) as RoomStatus

  if (
    ![propertyId, roomId].every((n) => Number.isInteger(n) && n > 0) ||
    !statusCode
  ) {
    throw new ServiceError('Invalid request.', 'validation')
  }

  await rooms.setRoomStatus(propertyId, roomId, statusCode)
  revalidatePath(`/caretaker/properties/${propertyId}/rooms/${roomId}`)
  revalidatePath(`/caretaker/properties/${propertyId}`)
}
