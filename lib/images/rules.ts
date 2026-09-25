/**
 * Rules for property / room photos, shared by the browser (to fail fast) and the server (the
 * authority). Pure: no I/O, so it is easy to test.
 */

export const IMAGE_BUCKET = 'property-images'
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_PROPERTY_IMAGES = 12
export const MAX_ROOM_IMAGES = 8

export type ImageTarget =
  | { kind: 'property'; propertyId: number }
  | { kind: 'room'; propertyId: number; roomId: number }

export const imageLimit = (target: ImageTarget) =>
  target.kind === 'property' ? MAX_PROPERTY_IMAGES : MAX_ROOM_IMAGES

const EXTENSION: Record<(typeof ALLOWED_IMAGE_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function extensionFor(mime: string): string | null {
  return (EXTENSION as Record<string, string>)[mime] ?? null
}

/** Human-readable reason a file cannot be used, or null if it is fine. */
export function validateImageFile(file: {
  type: string
  size: number
  name?: string
}): string | null {
  const label = file.name ? `“${file.name}”` : 'This file'
  if (!extensionFor(file.type)) {
    return `${label} isn't a supported image. Use JPG, PNG or WebP.`
  }
  if (file.size <= 0) return `${label} is empty.`
  if (file.size > MAX_IMAGE_BYTES) {
    return `${label} is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`
  }
  return null
}

/** Checks a batch of new files against the per-target limit (counting what is already there). */
export function validateBatch(
  target: ImageTarget,
  existingCount: number,
  files: { type: string; size: number; name?: string }[],
): string | null {
  if (files.length === 0) return 'Choose at least one photo.'
  const limit = imageLimit(target)
  if (existingCount + files.length > limit) {
    const room = Math.max(0, limit - existingCount)
    return room === 0
      ? `This ${target.kind} already has the maximum of ${limit} photos.`
      : `You can add ${room} more photo${room === 1 ? '' : 's'} (limit ${limit}).`
  }
  for (const file of files) {
    const problem = validateImageFile(file)
    if (problem) return problem
  }
  return null
}

/** The folder every file for this target lives in. */
export function storagePrefix(target: ImageTarget): string {
  return target.kind === 'property'
    ? `properties/${target.propertyId}/`
    : `rooms/${target.roomId}/`
}

const PATH_SHAPE =
  /^(properties|rooms)\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/

/**
 * Is `path` a file this target may claim? It must sit in the target's own folder and look like a
 * name WE issued — so nobody can register someone else's photo, or an arbitrary path, as theirs.
 */
export function isPathForTarget(path: string, target: ImageTarget): boolean {
  return path.startsWith(storagePrefix(target)) && PATH_SHAPE.test(path)
}

export function newStoragePath(
  target: ImageTarget,
  mime: string,
  uuid: string = crypto.randomUUID(),
): string | null {
  const ext = extensionFor(mime)
  return ext ? `${storagePrefix(target)}${uuid}.${ext}` : null
}
