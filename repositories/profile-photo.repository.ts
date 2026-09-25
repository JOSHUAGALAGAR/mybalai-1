import 'server-only'

import { AVATAR_BUCKET } from '@/lib/identity/rules'
import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'

const db = () => createAdminClient()

export async function createSignedUpload(
  path: string,
): Promise<{ path: string; token: string }> {
  const { data, error } = await db()
    .storage.from(AVATAR_BUCKET)
    .createSignedUploadUrl(path)
  if (error || !data) {
    throw new RepositoryError(
      'Profile photos are not set up yet. Ask an administrator to apply migration 0015.',
      error,
    )
  }
  return { path: data.path, token: data.token }
}

export async function objectExists(path: string): Promise<boolean> {
  const { data, error } = await db().storage.from(AVATAR_BUCKET).exists(path)
  return !error && Boolean(data)
}

export function publicUrl(path: string): string {
  return db().storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}

/** The storage path behind a public avatar URL of ours, or null (e.g. a Google profile picture). */
export function pathFromPublicUrl(url: string | null): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1
    ? null
    : decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await db().storage.from(AVATAR_BUCKET).remove(paths)
}

export async function currentAvatarUrl(userId: number): Promise<string | null> {
  const { data, error } = await db()
    .from('user_accounts')
    .select('avatar_url')
    .eq('legacy_user_id', userId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load your profile.', error)
  return data?.avatar_url ?? null
}

export async function setAvatarUrl(
  userId: number,
  url: string | null,
): Promise<void> {
  const { error } = await db()
    .from('user_accounts')
    .update({ avatar_url: url })
    .eq('legacy_user_id', userId)
  if (error)
    throw new RepositoryError('Failed to save your profile photo.', error)
}
