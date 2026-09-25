import 'server-only'

import {
  imageLimit,
  isPathForTarget,
  newStoragePath,
  validateBatch,
  validateImageFile,
  type ImageTarget,
} from '@/lib/images/rules'
import * as repo from '@/repositories/property-images.repository'
import { ServiceError } from '@/services/errors'
import {
  requireManageableProperty,
  requireManageableRoom,
} from '@/services/property-access'

/**
 * Photo galleries for properties and rooms.
 *
 * Flow: the browser asks `prepareUploads` for one-time upload links, sends the files straight to
 * Storage, then calls `registerUploads` to record them. The server never handles the file bytes
 * (no request-size limit to hit) and only ever hands out links for a property/room the caller
 * manages. The cover is mirrored into `properties.property_image` / `rooms.room_image`.
 */

export type GalleryImage = {
  imageId: number
  url: string
  isCover: boolean
  originalFilename: string | null
}

const toGallery = (rows: repo.ImageRow[]): GalleryImage[] =>
  rows.map((r) => ({
    imageId: r.imageId,
    url: r.url,
    isCover: r.isCover,
    originalFilename: r.originalFilename,
  }))

/** Only someone who manages the property (owner / superadmin) may touch its photos. */
async function authorize(target: ImageTarget): Promise<void> {
  if (target.kind === 'property') {
    await requireManageableProperty(target.propertyId)
  } else {
    await requireManageableRoom(target.propertyId, target.roomId)
  }
}

export async function listGallery(
  target: ImageTarget,
): Promise<GalleryImage[]> {
  await authorize(target)
  return toGallery(await repo.listImages(target))
}

/**
 * A property's photo gallery plus one per room, authorised once. `null` = the photo tables are
 * not set up yet (migration 0013), so callers can keep working without photos.
 */
export async function listPropertyGalleries(
  propertyId: number,
  roomIds: number[],
): Promise<{
  property: GalleryImage[]
  rooms: Record<number, GalleryImage[]>
} | null> {
  await requireManageableProperty(propertyId)
  try {
    const [property, ...rooms] = await Promise.all([
      repo.listImages({ kind: 'property', propertyId }),
      ...roomIds.map((roomId) =>
        repo.listImages({ kind: 'room', propertyId, roomId }),
      ),
    ])
    return {
      property: toGallery(property),
      rooms: Object.fromEntries(
        roomIds.map((id, i) => [id, toGallery(rooms[i])]),
      ),
    }
  } catch (error) {
    console.error('[images] gallery unavailable:', error)
    return null
  }
}

export type UploadFileInfo = { name: string; type: string; size: number }

/** Validate the files and issue one upload link per file. */
export async function prepareUploads(
  target: ImageTarget,
  files: UploadFileInfo[],
): Promise<{ uploads: { path: string; token: string; index: number }[] }> {
  await authorize(target)
  const existing = await repo.listImages(target)

  const problem = validateBatch(target, existing.length, files)
  if (problem) throw new ServiceError(problem, 'validation')

  const uploads = await Promise.all(
    files.map(async (file, index) => {
      const path = newStoragePath(target, file.type)
      // validateBatch already rejected unsupported types; this only guards the impossible.
      if (!path) throw new ServiceError('Unsupported image type.', 'validation')
      const link = await repo.createSignedUpload(path)
      return { ...link, index }
    }),
  )
  return { uploads }
}

export type UploadedFile = {
  path: string
  name: string
  type: string
  size: number
}

/**
 * Record files the browser has finished uploading. `coverPath` picks the cover; otherwise the
 * first photo of a gallery with no cover becomes the cover.
 */
export async function registerUploads(
  target: ImageTarget,
  files: UploadedFile[],
  coverPath?: string,
): Promise<GalleryImage[]> {
  await authorize(target)
  if (files.length === 0)
    throw new ServiceError('No photos to save.', 'validation')

  // Only files WE issued for THIS target — never an arbitrary or someone else's path.
  for (const f of files) {
    if (!isPathForTarget(f.path, target)) {
      throw new ServiceError('That photo does not belong here.', 'forbidden')
    }
    const problem = validateImageFile(f)
    if (problem) throw new ServiceError(problem, 'validation')
  }
  if (coverPath !== undefined && !files.some((f) => f.path === coverPath)) {
    throw new ServiceError(
      'The cover photo must be one of the new photos.',
      'validation',
    )
  }

  const existing = await repo.listImages(target)
  const known = new Set(existing.map((e) => e.storagePath))
  const fresh = files.filter((f) => !known.has(f.path)) // re-submitting is harmless
  if (existing.length + fresh.length > imageLimit(target)) {
    throw new ServiceError(
      `A ${target.kind} can have at most ${imageLimit(target)} photos.`,
      'validation',
    )
  }

  // Every file must really be in Storage (an upload can fail after we issued its link).
  const present = await Promise.all(fresh.map((f) => repo.objectExists(f.path)))
  const missing = fresh.filter((_, i) => !present[i])
  if (missing.length > 0) {
    await repo.removeObjects(
      fresh.filter((_, i) => present[i]).map((f) => f.path),
    )
    throw new ServiceError(
      'Some photos did not finish uploading. Please try again.',
      'conflict',
    )
  }

  const hasCover = existing.some((e) => e.isCover)
  const chosenCover =
    coverPath && !known.has(coverPath)
      ? coverPath
      : !hasCover
        ? fresh[0]?.path
        : undefined
  if (chosenCover && hasCover) await repo.clearCover(target)

  const start = await repo.nextSortOrder(target)
  await repo.insertImages(
    target,
    fresh.map((f, i) => ({
      storagePath: f.path,
      originalFilename: f.name.slice(0, 200) || null,
      mimeType: f.type,
      fileSize: f.size,
      isCover: f.path === chosenCover,
      sortOrder: start + i,
    })),
  )

  const all = await repo.listImages(target)
  await syncCover(target, all)
  return toGallery(all)
}

/** Make an existing photo the cover. */
export async function setCoverImage(
  target: ImageTarget,
  imageId: number,
): Promise<GalleryImage[]> {
  await authorize(target)
  const image = await repo.getImage(target.kind, imageId)
  if (!image || image.ownerId !== repo.ownerIdOf(target)) {
    throw new ServiceError('Photo not found.', 'not_found')
  }
  if (!image.isCover) {
    await repo.clearCover(target)
    await repo.markCover(target.kind, imageId)
  }
  const all = await repo.listImages(target)
  await syncCover(target, all)
  return toGallery(all)
}

/** Delete a photo (and its file). If it was the cover, the next photo takes over. */
export async function removeImage(
  target: ImageTarget,
  imageId: number,
): Promise<GalleryImage[]> {
  await authorize(target)
  const image = await repo.getImage(target.kind, imageId)
  if (!image || image.ownerId !== repo.ownerIdOf(target)) {
    throw new ServiceError('Photo not found.', 'not_found')
  }

  await repo.deleteImageRow(target.kind, imageId)
  await repo.removeObjects([image.storagePath])

  let all = await repo.listImages(target)
  if (image.isCover && all.length > 0 && !all.some((a) => a.isCover)) {
    await repo.markCover(target.kind, all[0].imageId)
    all = await repo.listImages(target)
  }
  await syncCover(target, all, image.isCover)
  return toGallery(all)
}

/**
 * Mirror the cover into the legacy single-image column. An empty gallery leaves the column
 * alone unless we just removed the cover (so a link pasted the old way is never wiped by accident).
 */
async function syncCover(
  target: ImageTarget,
  all: repo.ImageRow[],
  removedCover = false,
): Promise<void> {
  const cover = all.find((a) => a.isCover)
  if (cover) await repo.syncOwnerCover(target, cover.url)
  else if (removedCover) await repo.syncOwnerCover(target, null)
}

/** Public gallery for tenants: cover first. No authorisation — these photos are public. */
export async function publicGallery(target: ImageTarget): Promise<string[]> {
  const map = await repo.listUrlsByOwners(target.kind, [repo.ownerIdOf(target)])
  return map.get(repo.ownerIdOf(target)) ?? []
}

export async function publicGalleries(
  kind: ImageTarget['kind'],
  ownerIds: number[],
): Promise<Map<number, string[]>> {
  return repo.listUrlsByOwners(kind, ownerIds)
}
