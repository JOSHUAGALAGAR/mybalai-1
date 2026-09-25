import 'server-only'

import { invalidateCurrentUser, requireUser } from '@/lib/auth/dal'
import {
  AVATAR_BUCKET,
  isAvatarPathFor,
  MAX_AVATAR_BYTES,
  newAvatarPath,
  validateUploadFile,
} from '@/lib/identity/rules'
import * as repo from '@/repositories/profile-photo.repository'
import {
  avatarRegisterSchema,
  avatarUploadSchema,
} from '@/schemas/verification'
import { ServiceError, parseOrThrow } from '@/services/errors'

/**
 * A user's own profile photo (any role). The phone sends the file straight to Storage using a
 * one-time link this service issues for a name the SERVER chose, then tells us it arrived.
 */

export async function prepareAvatarUpload(
  input: unknown,
): Promise<{ path: string; token: string }> {
  const user = await requireUser()
  const file = parseOrThrow(avatarUploadSchema, input)
  const problem = validateUploadFile(file, MAX_AVATAR_BYTES)
  if (problem) throw new ServiceError(problem, 'validation')
  const path = newAvatarPath(user.legacyUserId, file.type)
  if (!path) throw new ServiceError('Unsupported image type.', 'validation')
  return repo.createSignedUpload(path)
}

/** Make an uploaded file the profile photo; the previous one (if ours) is deleted. */
export async function registerAvatar(
  input: unknown,
): Promise<{ avatarUrl: string }> {
  const user = await requireUser()
  const { path } = parseOrThrow(avatarRegisterSchema, input)

  if (!isAvatarPathFor(path, user.legacyUserId)) {
    throw new ServiceError(
      'That photo was not uploaded for your account.',
      'forbidden',
    )
  }
  if (!(await repo.objectExists(path))) {
    throw new ServiceError(
      'The photo did not finish uploading. Please try again.',
      'conflict',
    )
  }

  const previous = repo.pathFromPublicUrl(
    await repo.currentAvatarUrl(user.legacyUserId),
  )
  const url = repo.publicUrl(path)
  await repo.setAvatarUrl(user.legacyUserId, url)
  if (previous && previous !== path)
    await repo.removeObjects([previous]).catch(() => {})
  invalidateCurrentUser(user.authUserId)
  return { avatarUrl: url }
}

export async function removeAvatar(): Promise<void> {
  const user = await requireUser()
  const previous = repo.pathFromPublicUrl(
    await repo.currentAvatarUrl(user.legacyUserId),
  )
  await repo.setAvatarUrl(user.legacyUserId, null)
  if (previous) await repo.removeObjects([previous]).catch(() => {})
  invalidateCurrentUser(user.authUserId)
}

export { AVATAR_BUCKET }
