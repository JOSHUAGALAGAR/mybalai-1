/**
 * Profile photo and government-ID upload rules. Pure (no I/O), shared by the server (the
 * authority) and anything that wants to fail fast. Files are named by the SERVER, so a caller
 * cannot pick where a file lands or overwrite someone else's.
 */
import { extensionFor } from '@/lib/images/rules'

export const AVATAR_BUCKET = 'profile-images'
/** PRIVATE bucket: there is no public URL for these files. */
export const ID_BUCKET = 'id-documents'

export const MAX_AVATAR_BYTES = 3 * 1024 * 1024
export const MAX_ID_BYTES = 8 * 1024 * 1024

export const ID_TYPES = [
  { code: 'philsys', label: 'Philippine National ID (PhilSys)' },
  { code: 'drivers_license', label: "Driver's License" },
  { code: 'passport', label: 'Passport' },
  { code: 'umid', label: 'UMID' },
  { code: 'prc', label: 'PRC ID' },
  { code: 'postal', label: 'Postal ID' },
  { code: 'voters', label: "Voter's ID" },
  { code: 'sss', label: 'SSS ID' },
  { code: 'tin', label: 'TIN ID' },
  { code: 'philhealth', label: 'PhilHealth ID' },
] as const

export type IdTypeCode = (typeof ID_TYPES)[number]['code']
export const ID_TYPE_CODES = ID_TYPES.map((t) => t.code) as [
  IdTypeCode,
  ...IdTypeCode[],
]

export const idTypeLabel = (code: string): string =>
  ID_TYPES.find((t) => t.code === code)?.label ?? code

export type IdSide = 'front' | 'back'

/** Reason a file cannot be used, or null. */
export function validateUploadFile(
  file: { type: string; size: number; name?: string },
  maxBytes: number,
): string | null {
  const label = file.name ? `“${file.name}”` : 'This file'
  if (!extensionFor(file.type)) {
    return `${label} isn't a supported image. Use JPG, PNG or WebP.`
  }
  if (file.size <= 0) return `${label} is empty.`
  if (file.size > maxBytes) {
    return `${label} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`
  }
  return null
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const EXT = '(?:jpg|png|webp)'

export function newAvatarPath(userId: number, mime: string): string | null {
  const ext = extensionFor(mime)
  return ext ? `avatars/${userId}/${crypto.randomUUID()}.${ext}` : null
}

/** Is `path` one of THIS user's avatar files? */
export function isAvatarPathFor(path: string, userId: number): boolean {
  return new RegExp(`^avatars/${userId}/${UUID}\\.${EXT}$`).test(path)
}

export function newIdPath(
  userId: number,
  side: IdSide,
  mime: string,
): string | null {
  const ext = extensionFor(mime)
  return ext ? `identity/${userId}/${crypto.randomUUID()}-${side}.${ext}` : null
}

/** Is `path` a file THIS user was issued for that side of an ID? */
export function isIdPathFor(
  path: string,
  userId: number,
  side: IdSide,
): boolean {
  return new RegExp(`^identity/${userId}/${UUID}-${side}\\.${EXT}$`).test(path)
}
