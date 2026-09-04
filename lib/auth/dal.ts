import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAppRole, roleHome, type AppRole } from '@/lib/auth/roles'

/**
 * Data Access Layer for identity.
 *
 * `getCurrentUser()` resolves the Supabase Auth user to the legacy MyBalai
 * account (`user_accounts.legacy_user_id`) plus its roles, and is the single
 * source of truth for "who is the caller" across Server Components, Server
 * Actions and the service layer.
 *
 * The account/role lookup uses the admin client because `public.user_roles`
 * has RLS enabled with no SELECT policy. This module is `server-only` and
 * returns a narrow DTO, never raw rows.
 */

export type CurrentUser = {
  authUserId: string
  legacyUserId: number
  email: string | null
  fullName: string | null
  phone: string | null
  address: string | null
  avatarUrl: string | null
  isActive: boolean
  roles: AppRole[]
}

export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const authUser = await getAuthUser()
  if (!authUser) return null

  const admin = createAdminClient()

  const { data: account, error: accountError } = await admin
    .from('user_accounts')
    .select(
      'legacy_user_id, email, full_name, phone, address, avatar_url, is_active',
    )
    .eq('auth_user_id', authUser.id)
    .maybeSingle()

  if (accountError) {
    throw new Error(`Failed to load user account: ${accountError.message}`)
  }
  if (!account) {
    // Auth user exists but provisioning has not run (or failed). Treat as
    // unauthenticated so the caller is redirected to a clean state.
    return null
  }

  const { data: roleLinks, error: roleLinkError } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('legacy_user_id', account.legacy_user_id)

  if (roleLinkError) {
    throw new Error(`Failed to load user roles: ${roleLinkError.message}`)
  }

  const roleIds = (roleLinks ?? []).map((r) => r.role_id)
  let roles: AppRole[] = []

  if (roleIds.length > 0) {
    const { data: roleRows, error: roleError } = await admin
      .from('roles')
      .select('role_code')
      .in('role_id', roleIds)

    if (roleError) {
      throw new Error(`Failed to load role definitions: ${roleError.message}`)
    }

    roles = (roleRows ?? [])
      .map((r) => r.role_code)
      .filter((code): code is AppRole => isAppRole(code))
  }

  return {
    authUserId: authUser.id,
    legacyUserId: account.legacy_user_id,
    email: account.email,
    fullName: account.full_name,
    phone: account.phone,
    address: account.address,
    avatarUrl: account.avatar_url,
    isActive: account.is_active,
    roles,
  }
})

/** Redirects to /login when there is no usable session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  // A deactivated account keeps its session but loses access.
  if (!user.isActive) redirect('/unauthorized')
  return user
}

/** Redirects to /unauthorized when the caller holds none of the allowed roles. */
export async function requireRole(
  ...allowed: [AppRole, ...AppRole[]]
): Promise<CurrentUser> {
  const user = await requireUser()
  if (!allowed.some((role) => user.roles.includes(role))) {
    redirect('/unauthorized')
  }
  return user
}

/**
 * Guards a role-specific area (e.g. `/landlord/*`). If the caller is
 * authenticated but not in `allowed`, forwards them to *their own* home
 * rather than a hard 403 — they wandered into the wrong section.
 */
export async function requireArea(
  ...allowed: [AppRole, ...AppRole[]]
): Promise<CurrentUser> {
  const user = await requireUser()
  if (!allowed.some((role) => user.roles.includes(role))) {
    // No roles at all -> mis-provisioned; a hard stop avoids a redirect loop
    // (roleHome([]) is the tenant home, which would bounce back here).
    redirect(user.roles.length === 0 ? '/unauthorized' : roleHome(user.roles))
  }
  return user
}
