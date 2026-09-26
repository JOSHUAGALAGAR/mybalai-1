import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'

const db = () => createAdminClient()

export async function insertAppDownload(platform = 'android'): Promise<void> {
  const { error } = await db().from('app_downloads').insert({ platform })
  if (error) throw new RepositoryError('Failed to record the download.', error)
}

/** Downloads since `since` (ISO time), or all of them when omitted. */
export async function countAppDownloads(since?: string): Promise<number> {
  let query = db()
    .from('app_downloads')
    .select('download_id', { count: 'exact', head: true })
  if (since) query = query.gte('created_at', since)
  const { count, error } = await query
  if (error) throw new RepositoryError('Failed to count downloads.', error)
  return count ?? 0
}
