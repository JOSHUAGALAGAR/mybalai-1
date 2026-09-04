import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type PropertyRow = Tables<'properties'>

/** Every non-deleted property across all landlords, newest first. */
export async function listAllProperties(): Promise<PropertyRow[]> {
  const { data, error } = await createAdminClient()
    .from('properties')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load properties.', error)
  return data ?? []
}

export type OwnerSummary = {
  legacyUserId: number
  fullName: string | null
  email: string | null
  phone: string | null
  businessName: string | null
  contactNumber: string | null
}

/** Account + landlord-profile details for a set of property owners. */
export async function ownerSummariesByIds(
  ids: number[],
): Promise<Map<number, OwnerSummary>> {
  const unique = [...new Set(ids.filter((id): id is number => id != null))]
  if (unique.length === 0) return new Map()

  const admin = createAdminClient()
  const [
    { data: accounts, error: accErr },
    { data: profiles, error: profErr },
  ] = await Promise.all([
    admin
      .from('user_accounts')
      .select('legacy_user_id, full_name, email, phone')
      .in('legacy_user_id', unique),
    admin
      .from('landlord_profiles')
      .select('legacy_user_id, business_name, contact_number')
      .in('legacy_user_id', unique),
  ])
  if (accErr) throw new RepositoryError('Failed to load owners.', accErr)
  if (profErr)
    throw new RepositoryError('Failed to load owner profiles.', profErr)

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.legacy_user_id, p]),
  )
  const out = new Map<number, OwnerSummary>()
  for (const a of accounts ?? []) {
    const p = profileById.get(a.legacy_user_id)
    out.set(a.legacy_user_id, {
      legacyUserId: a.legacy_user_id,
      fullName: a.full_name,
      email: a.email,
      phone: a.phone,
      businessName: p?.business_name ?? null,
      contactNumber: p?.contact_number ?? null,
    })
  }
  return out
}

export async function listLandlordAccounts(): Promise<
  {
    legacyUserId: number
    fullName: string | null
    email: string | null
    isActive: boolean
  }[]
> {
  const admin = createAdminClient()
  const { data: role, error: roleErr } = await admin
    .from('roles')
    .select('role_id')
    .eq('role_code', 'landlord')
    .maybeSingle()
  if (roleErr) throw new RepositoryError('Failed to resolve role.', roleErr)
  if (!role) return []

  const { data: links, error: linkErr } = await admin
    .from('user_roles')
    .select('legacy_user_id')
    .eq('role_id', role.role_id)
  if (linkErr) throw new RepositoryError('Failed to load landlords.', linkErr)

  const ids = (links ?? []).map((l) => l.legacy_user_id)
  if (ids.length === 0) return []

  const { data: accounts, error } = await admin
    .from('user_accounts')
    .select('legacy_user_id, full_name, email, is_active')
    .in('legacy_user_id', ids)
    .order('legacy_user_id', { ascending: true })
  if (error) throw new RepositoryError('Failed to load landlords.', error)
  return (accounts ?? []).map((a) => ({
    legacyUserId: a.legacy_user_id,
    fullName: a.full_name,
    email: a.email,
    isActive: a.is_active,
  }))
}

/**
 * Idempotently provision a landlord's app rows for an existing auth user.
 * Mirrors the `handle_new_user` trigger (migration 0003) so account creation
 * works even before that migration is applied. Returns the legacy user id.
 */
export async function ensureLandlordProvisioned(input: {
  authUserId: string
  email: string
  fullName: string
  businessName: string | null
}): Promise<number> {
  const admin = createAdminClient()

  const { data: existing, error: exErr } = await admin
    .from('user_accounts')
    .select('legacy_user_id')
    .eq('auth_user_id', input.authUserId)
    .maybeSingle()
  if (exErr) throw new RepositoryError('Failed to read account.', exErr)

  let legacyUserId = existing?.legacy_user_id
  if (legacyUserId == null) {
    const { data: inserted, error: insErr } = await admin
      .from('user_accounts')
      .insert({
        auth_user_id: input.authUserId,
        email: input.email,
        full_name: input.fullName,
      })
      .select('legacy_user_id')
      .single()
    if (insErr) throw new RepositoryError('Failed to create account.', insErr)
    legacyUserId = inserted.legacy_user_id
  }

  const { data: role, error: roleErr } = await admin
    .from('roles')
    .select('role_id')
    .eq('role_code', 'landlord')
    .maybeSingle()
  if (roleErr) throw new RepositoryError('Failed to resolve role.', roleErr)
  if (!role) {
    throw new RepositoryError(
      'The landlord role is missing. Apply migration 0002.',
    )
  }

  const { error: urErr } = await admin
    .from('user_roles')
    .upsert(
      { legacy_user_id: legacyUserId, role_id: role.role_id },
      { onConflict: 'legacy_user_id,role_id', ignoreDuplicates: true },
    )
  if (urErr) throw new RepositoryError('Failed to link role.', urErr)

  const { error: lpErr } = await admin.from('landlord_profiles').upsert(
    {
      legacy_user_id: legacyUserId,
      business_name: input.businessName,
    },
    { onConflict: 'legacy_user_id', ignoreDuplicates: true },
  )
  if (lpErr) throw new RepositoryError('Failed to create profile.', lpErr)

  return legacyUserId
}

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

export type AdminUserRow = {
  legacyUserId: number
  fullName: string | null
  email: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
  roles: string[]
}

/** role codes keyed by legacy_user_id for a set of users. */
export async function roleCodesByUserIds(
  ids: number[],
): Promise<Map<number, string[]>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const admin = createAdminClient()

  const { data: links, error: linkErr } = await admin
    .from('user_roles')
    .select('legacy_user_id, role_id')
    .in('legacy_user_id', unique)
  if (linkErr) throw new RepositoryError('Failed to load roles.', linkErr)

  const roleIds = [...new Set((links ?? []).map((l) => l.role_id))]
  const { data: roles, error: roleErr } = await admin
    .from('roles')
    .select('role_id, role_code')
    .in('role_id', roleIds.length ? roleIds : [-1])
  if (roleErr) throw new RepositoryError('Failed to load role codes.', roleErr)

  const codeById = new Map((roles ?? []).map((r) => [r.role_id, r.role_code]))
  const out = new Map<number, string[]>()
  for (const l of links ?? []) {
    const code = codeById.get(l.role_id)
    if (!code) continue
    const list = out.get(l.legacy_user_id) ?? []
    list.push(code)
    out.set(l.legacy_user_id, list)
  }
  return out
}

export async function listAllUsers(query?: string): Promise<AdminUserRow[]> {
  const admin = createAdminClient()
  let q = admin
    .from('user_accounts')
    .select('legacy_user_id, full_name, email, phone, is_active, created_at')
    .order('legacy_user_id', { ascending: true })
  if (query) {
    const like = `%${query.replace(/[%_]/g, (m) => `\\${m}`)}%`
    q = q.or(`full_name.ilike.${like},email.ilike.${like}`)
  }
  const { data, error } = await q
  if (error) throw new RepositoryError('Failed to load users.', error)

  const rows = data ?? []
  const rolesByUser = await roleCodesByUserIds(
    rows.map((r) => r.legacy_user_id),
  )
  return rows.map((r) => ({
    legacyUserId: r.legacy_user_id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    isActive: r.is_active,
    createdAt: r.created_at,
    roles: rolesByUser.get(r.legacy_user_id) ?? [],
  }))
}

export async function getUserRow(
  legacyUserId: number,
): Promise<(Tables<'user_accounts'> & { roles: string[] }) | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_accounts')
    .select('*')
    .eq('legacy_user_id', legacyUserId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load user.', error)
  if (!data) return null
  const roles = (await roleCodesByUserIds([legacyUserId])).get(legacyUserId)
  return { ...data, roles: roles ?? [] }
}

export async function setUserActive(
  legacyUserId: number,
  isActive: boolean,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('user_accounts')
    .update({ is_active: isActive })
    .eq('legacy_user_id', legacyUserId)
  if (error) throw new RepositoryError('Failed to update the account.', error)
}

export async function countActiveSuperadmins(): Promise<number> {
  const admin = createAdminClient()
  const { data: role } = await admin
    .from('roles')
    .select('role_id')
    .eq('role_code', 'superadmin')
    .maybeSingle()
  if (!role) return 0
  const { data: links, error } = await admin
    .from('user_roles')
    .select('legacy_user_id')
    .eq('role_id', role.role_id)
  if (error) throw new RepositoryError('Failed to count superadmins.', error)
  const ids = (links ?? []).map((l) => l.legacy_user_id)
  if (ids.length === 0) return 0
  const { count, error: cErr } = await admin
    .from('user_accounts')
    .select('legacy_user_id', { count: 'exact', head: true })
    .in('legacy_user_id', ids)
    .eq('is_active', true)
  if (cErr) throw new RepositoryError('Failed to count superadmins.', cErr)
  return count ?? 0
}
