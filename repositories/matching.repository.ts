import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables, TablesInsert } from '@/types/database'

export type PreferencesRow = Tables<'tenant_preferences'>

const db = () => createAdminClient()

export async function getPreferences(
  userId: number,
): Promise<PreferencesRow | null> {
  const { data, error } = await db()
    .from('tenant_preferences')
    .select('*')
    .eq('legacy_user_id', userId)
    .maybeSingle()
  if (error)
    throw new RepositoryError('Failed to load your preferences.', error)
  return data
}

export async function upsertPreferences(
  values: TablesInsert<'tenant_preferences'>,
): Promise<PreferencesRow> {
  const { data, error } = await db()
    .from('tenant_preferences')
    .upsert(
      { ...values, updated_at: new Date().toISOString() },
      { onConflict: 'legacy_user_id' },
    )
    .select('*')
    .single()
  if (error || !data)
    throw new RepositoryError('Failed to save your preferences.', error)
  return data
}

export async function deletePreferences(userId: number): Promise<void> {
  const { error } = await db()
    .from('tenant_preferences')
    .delete()
    .eq('legacy_user_id', userId)
  if (error)
    throw new RepositoryError('Failed to clear your preferences.', error)
}

/** When recommendations were last recorded for this tenant (to avoid logging every refresh). */
export async function lastLoggedAt(userId: number): Promise<string | null> {
  const { data, error } = await db()
    .from('match_logs')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to read the match log.', error)
  return data?.created_at ?? null
}

export async function insertLogs(
  rows: TablesInsert<'match_logs'>[],
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await db().from('match_logs').insert(rows)
  if (error) throw new RepositoryError('Failed to write the match log.', error)
}

/** Lifestyle answers of the people who chose to share them (room allocation only). */
export async function listSharedLifestyles(
  userIds: number[],
): Promise<PreferencesRow[]> {
  if (userIds.length === 0) return []
  const { data, error } = await db()
    .from('tenant_preferences')
    .select('*')
    .in('legacy_user_id', userIds)
    .eq('share_lifestyle', true)
  if (error)
    throw new RepositoryError('Failed to load lifestyle answers.', error)
  return data ?? []
}
