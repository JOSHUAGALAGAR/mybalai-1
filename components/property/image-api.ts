import {
  prepareImageUploadsAction,
  registerImageUploadsAction,
  removeImageAction,
  setCoverImageAction,
} from '@/app/(protected)/landlord/properties/image-actions'
import type { ImageApi } from '@/lib/images/upload'

/** The real server calls behind the photo components (tests and previews swap in fakes). */
export const serverImageApi: ImageApi = {
  prepare: (target, files) => prepareImageUploadsAction(target, files),
  register: (target, files, coverPath) =>
    registerImageUploadsAction(target, files, coverPath),
  setCover: (target, imageId) => setCoverImageAction(target, imageId),
  remove: (target, imageId) => removeImageAction(target, imageId),
}
