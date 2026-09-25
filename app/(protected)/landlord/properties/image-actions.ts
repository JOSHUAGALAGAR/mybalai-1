'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { isPhotoSetupProblem, PHOTO_SETUP_MESSAGE } from '@/lib/images/errors'
import type { ImageTarget } from '@/lib/images/rules'
import type { GalleryImage, Outcome } from '@/lib/images/upload'
import {
  imageFileInfoSchema as fileInfo,
  imageIdSchema as id,
  imageTargetSchema as targetSchema,
  uploadedImageSchema as uploadedFile,
} from '@/schemas/images'
import { ServiceError } from '@/services/errors'
import * as images from '@/services/property-images.service'

/**
 * Called from the browser (not a <form>): photo upload / cover / delete for a property or room.
 * Every argument is untrusted — validated here, then authorised again in the service.
 */

async function run<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (error) {
    if (error instanceof ServiceError)
      return { ok: false, message: error.message }
    if (error instanceof z.ZodError)
      return { ok: false, message: 'Invalid request.' }
    console.error('[landlord/images] action failed:', error)
    return {
      ok: false,
      message: isPhotoSetupProblem(error)
        ? PHOTO_SETUP_MESSAGE
        : error instanceof Error && /migration 0013/.test(error.message)
          ? error.message
          : 'Something went wrong. Please try again.',
    }
  }
}

function refresh(target: ImageTarget) {
  revalidatePath(`/landlord/properties/${target.propertyId}`)
  if (target.kind === 'room') {
    revalidatePath(
      `/landlord/properties/${target.propertyId}/rooms/${target.roomId}`,
    )
  }
  revalidatePath('/landlord/properties')
  revalidatePath(`/discover/${target.propertyId}`)
}

export async function prepareImageUploadsAction(
  target: unknown,
  files: unknown,
) {
  return run(async () =>
    images.prepareUploads(
      targetSchema.parse(target),
      z.array(fileInfo).min(1).max(20).parse(files),
    ),
  )
}

export async function registerImageUploadsAction(
  target: unknown,
  files: unknown,
  coverPath?: unknown,
): Promise<Outcome<GalleryImage[]>> {
  return run(async () => {
    const t = targetSchema.parse(target)
    const gallery = await images.registerUploads(
      t,
      z.array(uploadedFile).min(1).max(20).parse(files),
      z.string().max(300).optional().parse(coverPath),
    )
    refresh(t)
    return gallery
  })
}

export async function setCoverImageAction(
  target: unknown,
  imageId: unknown,
): Promise<Outcome<GalleryImage[]>> {
  return run(async () => {
    const t = targetSchema.parse(target)
    const gallery = await images.setCoverImage(t, id.parse(imageId))
    refresh(t)
    return gallery
  })
}

export async function removeImageAction(
  target: unknown,
  imageId: unknown,
): Promise<Outcome<GalleryImage[]>> {
  return run(async () => {
    const t = targetSchema.parse(target)
    const gallery = await images.removeImage(t, id.parse(imageId))
    refresh(t)
    return gallery
  })
}
