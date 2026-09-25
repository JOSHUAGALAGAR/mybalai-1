import 'server-only'

import { ID_BUCKET } from '@/lib/identity/rules'
import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type VerificationRow = Tables<'identity_verifications'>
export type VerificationStatus = 'pending' | 'approved' | 'rejected'

const db = () => createAdminClient()

/** A user's most recent submission (any status), or null. */
export async function latestForUser(
  userId: number,
): Promise<VerificationRow | null> {
  const { data, error } = await db()
    .from('identity_verifications')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .order('verification_id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error)
    throw new RepositoryError('Failed to load your verification.', error)
  return data
}

export async function getById(id: number): Promise<VerificationRow | null> {
  const { data, error } = await db()
    .from('identity_verifications')
    .select('*')
    .eq('verification_id', id)
    .maybeSingle()
  if (error)
    throw new RepositoryError('Failed to load the verification.', error)
  return data
}

export async function listByStatus(
  status: VerificationStatus,
  limit = 100,
): Promise<VerificationRow[]> {
  const { data, error } = await db()
    .from('identity_verifications')
    .select('*')
    .eq('status', status)
    // waiting ones oldest first (fair queue); decided ones newest first
    .order('submitted_at', { ascending: status === 'pending' })
    .limit(limit)
  if (error) throw new RepositoryError('Failed to load verifications.', error)
  return data ?? []
}

export async function countByStatus(
  status: VerificationStatus,
): Promise<number> {
  const { count, error } = await db()
    .from('identity_verifications')
    .select('*', { count: 'exact', head: true })
    .eq('status', status)
  if (error) throw new RepositoryError('Failed to count verifications.', error)
  return count ?? 0
}

/** Throws a `duplicate` marker (Postgres 23505) when the tenant already has one waiting. */
export async function insertPending(values: {
  user_id: number
  id_type: string
  front_path: string
  back_path: string
}): Promise<VerificationRow> {
  const { data, error } = await db()
    .from('identity_verifications')
    .insert({ ...values, status: 'pending' })
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to submit your ID.', error)
  return data
}

/** Decide a submission only if it is still pending; null means someone else got there first. */
export async function decide(
  id: number,
  values: {
    status: 'approved' | 'rejected'
    reviewedBy: number
    reason: string | null
  },
): Promise<VerificationRow | null> {
  const { data, error } = await db()
    .from('identity_verifications')
    .update({
      status: values.status,
      reviewed_by: values.reviewedBy,
      reviewed_at: new Date().toISOString(),
      reject_reason: values.reason,
    })
    .eq('verification_id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to save the decision.', error)
  return data
}

export async function setIdVerifiedAt(
  userId: number,
  at: string | null,
): Promise<void> {
  const { error } = await db()
    .from('user_accounts')
    .update({ id_verified_at: at })
    .eq('legacy_user_id', userId)
  if (error)
    throw new RepositoryError('Failed to update the verified badge.', error)
}

/** When the tenant was verified, or null. Never throws: a missing column must not break sign-in. */
export async function getIdVerifiedAt(userId: number): Promise<string | null> {
  const { data, error } = await db()
    .from('user_accounts')
    .select('id_verified_at')
    .eq('legacy_user_id', userId)
    .maybeSingle()
  if (error) return null
  return data?.id_verified_at ?? null
}

export async function accountNames(
  userIds: number[],
): Promise<
  Map<
    number,
    { fullName: string | null; email: string | null; phone: string | null }
  >
> {
  const out = new Map<
    number,
    { fullName: string | null; email: string | null; phone: string | null }
  >()
  if (userIds.length === 0) return out
  const { data, error } = await db()
    .from('user_accounts')
    .select('legacy_user_id, full_name, email, phone')
    .in('legacy_user_id', [...new Set(userIds)])
  if (error) throw new RepositoryError('Failed to load accounts.', error)
  for (const a of data ?? []) {
    out.set(a.legacy_user_id, {
      fullName: a.full_name,
      email: a.email,
      phone: a.phone,
    })
  }
  return out
}

/* ---- the private bucket ---- */

export async function createSignedUpload(
  path: string,
): Promise<{ path: string; token: string }> {
  const { data, error } = await db()
    .storage.from(ID_BUCKET)
    .createSignedUploadUrl(path)
  if (error || !data) {
    throw new RepositoryError(
      'ID upload is not set up yet. Ask an administrator to apply migration 0015.',
      error,
    )
  }
  return { path: data.path, token: data.token }
}

export async function objectExists(path: string): Promise<boolean> {
  const { data, error } = await db().storage.from(ID_BUCKET).exists(path)
  return !error && Boolean(data)
}

/** A link that opens the private file for a short time only. */
export async function signedViewUrl(
  path: string,
  seconds = 60,
): Promise<string | null> {
  const { data, error } = await db()
    .storage.from(ID_BUCKET)
    .createSignedUrl(path, seconds)
  return error ? null : (data?.signedUrl ?? null)
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await db().storage.from(ID_BUCKET).remove(paths)
}
