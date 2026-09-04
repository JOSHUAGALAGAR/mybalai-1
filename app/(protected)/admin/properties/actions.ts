'use server'

import { revalidatePath } from 'next/cache'

import * as admin from '@/services/admin.service'
import { ServiceError } from '@/services/errors'

export type AdminPropertyActionState =
  | { status: 'error'; message: string }
  | { status: 'success'; message: string }
  | undefined

function toError(error: unknown): AdminPropertyActionState {
  if (error instanceof ServiceError) {
    return { status: 'error', message: error.message }
  }
  console.error('[admin/properties] action failed:', error)
  return { status: 'error', message: 'Something went wrong.' }
}

function propertyId(formData: FormData): number {
  const id = Number(formData.get('property_id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw new ServiceError('Invalid property.', 'validation')
  }
  return id
}

export async function setPropertyStatusAction(
  _prev: AdminPropertyActionState,
  formData: FormData,
): Promise<AdminPropertyActionState> {
  let id: number
  try {
    id = propertyId(formData)
    await admin.setPropertyStatus(id, {
      status_code: formData.get('status_code'),
    })
  } catch (error) {
    return toError(error)
  }
  revalidatePath('/admin/properties')
  revalidatePath(`/admin/properties/${id}`)
  return { status: 'success', message: 'Status updated.' }
}

export async function setPropertyFlagsAction(
  _prev: AdminPropertyActionState,
  formData: FormData,
): Promise<AdminPropertyActionState> {
  let id: number
  try {
    id = propertyId(formData)
    await admin.setPropertyFlags(id, {
      is_verified: formData.get('is_verified'),
      is_featured: formData.get('is_featured'),
    })
  } catch (error) {
    return toError(error)
  }
  revalidatePath('/admin/properties')
  revalidatePath(`/admin/properties/${id}`)
  return { status: 'success', message: 'Flags updated.' }
}
