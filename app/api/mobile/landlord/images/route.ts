import { mobileRoute, readJson } from '@/lib/api/mobile'
import { isPhotoSetupProblem, PHOTO_SETUP_MESSAGE } from '@/lib/images/errors'
import { mobileImageRequestSchema } from '@/schemas/images'
import { ServiceError, parseOrThrow } from '@/services/errors'
import * as images from '@/services/property-images.service'

export const dynamic = 'force-dynamic'

/**
 * Photos for a property or room, one endpoint, four operations (`op`):
 *   prepare  → one-time upload links (the app then sends each file straight to Storage)
 *   register → record the files that arrived (+ which one is the cover)
 *   cover    → make an existing photo the cover
 *   remove   → delete a photo
 * Same service as the website: the caller must manage the property, paths are server-named.
 */
export const POST = mobileRoute(
  async ({ request }) => {
    const body = parseOrThrow(mobileImageRequestSchema, await readJson(request))
    try {
      switch (body.op) {
        case 'prepare':
          return await images.prepareUploads(body.target, body.files)
        case 'register':
          return {
            images: await images.registerUploads(
              body.target,
              body.files,
              body.coverPath,
            ),
          }
        case 'cover':
          return {
            images: await images.setCoverImage(body.target, body.imageId),
          }
        case 'remove':
          return { images: await images.removeImage(body.target, body.imageId) }
      }
    } catch (error) {
      if (isPhotoSetupProblem(error)) {
        throw new ServiceError(PHOTO_SETUP_MESSAGE, 'conflict')
      }
      throw error
    }
  },
  { roles: ['landlord'] },
)
