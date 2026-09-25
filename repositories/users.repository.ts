import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type UserAccountRow = Tables<'user_accounts'>

export async function getAccountByAuthId(
  authUserId: string,
): Promise<UserAccountRow | null> {
  const { data, error } = await createAdminClient()
    .from('user_accounts')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load account.', error)
  return data
}

export async function getAccountByEmail(
  email: string,
): Promise<UserAccountRow | null> {
  const { data, error } = await createAdminClient()
    .from('user_accounts')
    .select('*')
    .ilike('email', email)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to look up account.', error)
  return data
}

export async function getAccountById(
  legacyUserId: number,
): Promise<UserAccountRow | null> {
  const { data, error } = await createAdminClient()
    .from('user_accounts')
    .select('*')
    .eq('legacy_user_id', legacyUserId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load account.', error)
  return data
}

/** Accounts for a set of ids (tenant management shows name + contact). */
export async function listAccountsByIds(
  legacyUserIds: number[],
): Promise<UserAccountRow[]> {
  if (legacyUserIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('user_accounts')
    .select('*')
    .in('legacy_user_id', [...new Set(legacyUserIds)])
  if (error) throw new RepositoryError('Failed to load accounts.', error)
  return data ?? []
}

export async function getRoleCodes(legacyUserId: number): Promise<string[]> {
  const admin = createAdminClient()
  const { data: links, error: linkErr } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('legacy_user_id', legacyUserId)
  if (linkErr) throw new RepositoryError('Failed to load roles.', linkErr)

  const roleIds = (links ?? []).map((r) => r.role_id)
  if (roleIds.length === 0) return []

  const { data: rows, error } = await admin
    .from('roles')
    .select('role_code')
    .in('role_id', roleIds)
  if (error) throw new RepositoryError('Failed to load role codes.', error)
  return (rows ?? []).map((r) => r.role_code)
}
