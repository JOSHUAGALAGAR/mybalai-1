import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { IMAGE_BUCKET, type ImageTarget } from '@/lib/images/rules'
import { RepositoryError } from '@/repositories/reference.repository'

/** One stored photo, with its public URL (derived from the path — no URL is stored). */
export type ImageRow = {
  imageId: number
  ownerId: number
  storagePath: string
  originalFilename: string | null
  mimeType: string | null
  fileSize: number | null
  isCover: boolean
  sortOrder: number
  createdAt: string
  url: string
}

export type NewImage = {
  storagePath: string
  originalFilename: string | null
  mimeType: string
  fileSize: number
  isCover: boolean
  sortOrder: number
}

type Kind = ImageTarget['kind']

// The two baseline tables have parallel shapes with differently named columns.
const SHAPE = {
  property: {
    table: 'property_images',
    idCol: 'property_image_id',
    ownerCol: 'property_id',
  },
  room: { table: 'room_images', idCol: 'room_image_id', ownerCol: 'room_id' },
} as const

export const ownerIdOf = (target: ImageTarget) =>
  target.kind === 'property' ? target.propertyId : target.roomId

export function publicUrl(storagePath: string): string {
  return createAdminClient()
    .storage.from(IMAGE_BUCKET)
    .getPublicUrl(storagePath).data.publicUrl
}

type Raw = Record<string, unknown>

function toRow(kind: Kind, raw: Raw): ImageRow {
  const shape = SHAPE[kind]
  const path = String(raw.storage_path)
  return {
    imageId: Number(raw[shape.idCol]),
    ownerId: Number(raw[shape.ownerCol]),
    storagePath: path,
    originalFilename: (raw.original_filename as string | null) ?? null,
    mimeType: (raw.mime_type as string | null) ?? null,
    fileSize: raw.file_size == null ? null : Number(raw.file_size),
    isCover: Boolean(raw.is_cover),
    sortOrder: Number(raw.sort_order ?? 0),
    createdAt: String(raw.created_at),
    url: publicUrl(path),
  }
}

/* The generated table types are per-table; these helpers address either one. */
const from = (kind: Kind) =>
  createAdminClient().from(SHAPE[kind].table) as unknown as ReturnType<
    ReturnType<typeof createAdminClient>['from']
  >

/** Photos for one property or room: cover first, then in upload order. */
export async function listImages(target: ImageTarget): Promise<ImageRow[]> {
  const shape = SHAPE[target.kind]
  const { data, error } = await from(target.kind)
    .select('*')
    .eq(shape.ownerCol, ownerIdOf(target))
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true })
    .order(shape.idCol, { ascending: true })
  if (error) throw new RepositoryError('Failed to load photos.', error)
  return ((data ?? []) as Raw[]).map((r) => toRow(target.kind, r))
}

/** Public gallery URLs for several owners at once (cover first). No authorisation — public data. */
export async function listUrlsByOwners(
  kind: Kind,
  ownerIds: number[],
): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>()
  if (ownerIds.length === 0) return out
  const shape = SHAPE[kind]
  const { data, error } = await from(kind)
    .select('*')
    .in(shape.ownerCol, [...new Set(ownerIds)])
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true })
    .order(shape.idCol, { ascending: true })
  if (error) throw new RepositoryError('Failed to load photos.', error)
  for (const raw of (data ?? []) as Raw[]) {
    const row = toRow(kind, raw)
    out.set(row.ownerId, [...(out.get(row.ownerId) ?? []), row.url])
  }
  return out
}

export async function getImage(
  kind: Kind,
  imageId: number,
): Promise<ImageRow | null> {
  const shape = SHAPE[kind]
  const { data, error } = await from(kind)
    .select('*')
    .eq(shape.idCol, imageId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the photo.', error)
  return data ? toRow(kind, data as Raw) : null
}

export async function nextSortOrder(target: ImageTarget): Promise<number> {
  const shape = SHAPE[target.kind]
  const { data, error } = await from(target.kind)
    .select('sort_order')
    .eq(shape.ownerCol, ownerIdOf(target))
    .order('sort_order', { ascending: false })
    .limit(1)
  if (error) throw new RepositoryError('Failed to load photos.', error)
  const top = ((data ?? []) as Raw[])[0]?.sort_order
  return top == null ? 0 : Number(top) + 1
}

export async function insertImages(
  target: ImageTarget,
  items: NewImage[],
): Promise<void> {
  if (items.length === 0) return
  const shape = SHAPE[target.kind]
  const { error } = await from(target.kind).insert(
    items.map((i) => ({
      [shape.ownerCol]: ownerIdOf(target),
      storage_path: i.storagePath,
      original_filename: i.originalFilename,
      mime_type: i.mimeType,
      file_size: i.fileSize,
      is_cover: i.isCover,
      sort_order: i.sortOrder,
    })),
  )
  if (error) throw new RepositoryError('Failed to save the photos.', error)
}

export async function clearCover(target: ImageTarget): Promise<void> {
  const shape = SHAPE[target.kind]
  const { error } = await from(target.kind)
    .update({ is_cover: false })
    .eq(shape.ownerCol, ownerIdOf(target))
    .eq('is_cover', true)
  if (error) throw new RepositoryError('Failed to change the cover.', error)
}

export async function markCover(kind: Kind, imageId: number): Promise<void> {
  const { error } = await from(kind)
    .update({ is_cover: true })
    .eq(SHAPE[kind].idCol, imageId)
  if (error) throw new RepositoryError('Failed to change the cover.', error)
}

export async function deleteImageRow(
  kind: Kind,
  imageId: number,
): Promise<void> {
  const { error } = await from(kind).delete().eq(SHAPE[kind].idCol, imageId)
  if (error) throw new RepositoryError('Failed to remove the photo.', error)
}

/**
 * Keep the legacy single-image column in step with the cover, so every screen that shows
 * `property_image` / `room_image` (search, mobile, cards) keeps working.
 */
export async function syncOwnerCover(
  target: ImageTarget,
  url: string | null,
): Promise<void> {
  const admin = createAdminClient()
  const result =
    target.kind === 'property'
      ? await admin
          .from('properties')
          .update({ property_image: url })
          .eq('property_id', target.propertyId)
      : await admin
          .from('rooms')
          .update({ room_image: url })
          .eq('room_id', target.roomId)
  if (result.error) {
    throw new RepositoryError('Failed to update the cover image.', result.error)
  }
}

/* ---- Storage ---- */

/** A one-time link the browser uploads a single file to. Expires on its own. */
export async function createSignedUpload(
  path: string,
): Promise<{ path: string; token: string }> {
  const { data, error } = await createAdminClient()
    .storage.from(IMAGE_BUCKET)
    .createSignedUploadUrl(path)
  if (error || !data) {
    throw new RepositoryError(
      'Photo storage is not ready. Ask an administrator to apply migration 0013.',
      error,
    )
  }
  return { path: data.path, token: data.token }
}

export async function objectExists(path: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .storage.from(IMAGE_BUCKET)
    .exists(path)
  if (error) return false
  return Boolean(data)
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await createAdminClient()
    .storage.from(IMAGE_BUCKET)
    .remove(paths)
  // The row is already gone; an orphaned file is harmless, so don't fail the caller.
  if (error) console.error('[images] could not delete stored files:', error)
}
