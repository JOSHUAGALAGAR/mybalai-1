import 'server-only'

import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js'

import { publicEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { memoAsync } from '@/lib/utilities/memo-async'
import { isAppRole, roleHome, type AppRole } from '@/lib/auth/roles'
import { authMethodsFromClaims, lastAuthTimestamp } from '@/lib/auth/claims'

export { authMethodsFromClaims, lastAuthTimestamp }

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

/**
 * Who is signed in, read from the session cookie's JWT and VERIFIED locally against the project's
 * signing keys (`getClaims`) — no call to Supabase Auth. The old `getUser()` cost a ~300 ms network
 * round trip on every page. A token stays valid until it expires (an hour), but nothing that
 * matters relies on that alone: the account's `is_active` flag and roles are re-read from the
 * database (or its short cache) on every request.
 */
export const getAuthUser = cache(
  async (): Promise<{ id: string; email: string | null } | null> => {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    const claims = data?.claims
    if (!claims || typeof claims.sub !== 'string') return null
    return {
      id: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
    }
  },
)

/* ------------------------------------------------------------------ *
 * Mobile bearer-token identity
 * ------------------------------------------------------------------ */

/**
 * The mobile app authenticates with `Authorization: Bearer <supabase access
 * token>` instead of a cookie. When a Bearer header is present it is the ONLY
 * credential considered — an invalid token never falls back to a cookie. Other
 * schemes (e.g. Basic auth added by a proxy) are ignored and cookies apply.
 *
 * The project signs tokens with an asymmetric key, so `getClaims` verifies the
 * signature and expiry locally against a cached JWKS: no network round-trip
 * (the old `getUser(token)` cost ~300 ms per request). For a project that
 * still uses a shared secret, supabase-js falls back to asking Auth itself.
 * The client is a singleton so its JWKS cache survives between requests.
 */
let verifier: SupabaseClient | null = null

type AuthIdentity = {
  id: string
  viaBearer: boolean
  methods: string[]
  /** Unix seconds of the last time the password was typed in (from the token's `amr` claim). */
  passwordAuthAt: number | null
}

async function verifyBearer(token: string): Promise<{
  id: string
  methods: string[]
  passwordAuthAt: number | null
} | null> {
  verifier ??= createSupabaseClient(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data, error } = await verifier.auth.getClaims(token)
  const claims = data?.claims
  // `role` is `anon` for the publishable key itself — that is not a user.
  if (error || !claims || claims.role !== 'authenticated') return null
  if (typeof claims.sub !== 'string') return null
  return {
    id: claims.sub,
    methods: authMethodsFromClaims(claims),
    passwordAuthAt: lastAuthTimestamp(claims, 'password'),
  }
}

const getAuthIdentity = cache(async (): Promise<AuthIdentity | null> => {
  const authorization = (await headers()).get('authorization')
  const token = authorization
    ? /^Bearer\s+(\S+)$/i.exec(authorization)?.[1]
    : undefined
  if (token) {
    const verified = await verifyBearer(token)
    return verified ? { ...verified, viaBearer: true } : null
  }
  const user = await getAuthUser()
  return user
    ? { id: user.id, viaBearer: false, methods: [], passwordAuthAt: null }
    : null
})

/**
 * How the current request's session was authenticated. Only known for mobile (bearer) sessions —
 * the token says so; cookie sessions return []. Used to refuse Google sign-ins for landlords.
 */
export async function getSessionAuthMethods(): Promise<string[]> {
  return (await getAuthIdentity())?.methods ?? []
}

/** Seconds since the password was last typed in for this (mobile) session, or null if it never was. */
export async function getPasswordAuthAgeSeconds(): Promise<number | null> {
  const at = (await getAuthIdentity())?.passwordAuthAt ?? null
  return at === null ? null : Math.max(0, Math.floor(Date.now() / 1000) - at)
}

/**
 * Loading a user is a database round trip (~300 ms when the database is a few hundred ms away)
 * on EVERY page and API call, so the result is remembered briefly per auth user — for the mobile
 * app and the website alike. Trade-off: deactivating an account or changing a role takes up to
 * `CURRENT_USER_TTL_MS` to reach a session that is already open; code that changes a person's
 * account calls `invalidateCurrentUser` so their own next request sees it at once.
 */
const CURRENT_USER_TTL_MS = 20_000
const CURRENT_USER_MAX_ENTRIES = 500
const currentUserCache = new Map<
  string,
  { user: CurrentUser; expires: number }
>()

/** Forget a cached user (call after changing their profile). */
export function invalidateCurrentUser(authUserId: string): void {
  currentUserCache.delete(authUserId)
}

/** Role definitions are a handful of static rows; no need to fetch per user. */
const getRoleCodesById = memoAsync(async () => {
  const { data, error } = await createAdminClient()
    .from('roles')
    .select('role_id, role_code')
  if (error) {
    throw new Error(`Failed to load role definitions: ${error.message}`)
  }
  return new Map((data ?? []).map((r) => [r.role_id, r.role_code] as const))
}, 5 * 60_000)

type AccountWithRoles = {
  legacy_user_id: number
  email: string | null
  full_name: string | null
  phone: string | null
  address: string | null
  avatar_url: string | null
  is_active: boolean
  user_roles: { role_id: number }[] | null
}

/** The account AND its roles in ONE request (the roles ride along as an embedded list). */
async function loadCurrentUser(
  authUserId: string,
): Promise<CurrentUser | null> {
  const [{ data, error }, roleCodeById] = await Promise.all([
    createAdminClient()
      .from('user_accounts')
      .select(
        'legacy_user_id, email, full_name, phone, address, avatar_url, is_active, user_roles!user_roles_legacy_user_id_fkey(role_id)',
      )
      .eq('auth_user_id', authUserId)
      .maybeSingle(),
    getRoleCodesById(),
  ])
  if (error) throw new Error(`Failed to load user account: ${error.message}`)
  const account = data as unknown as AccountWithRoles | null
  if (!account) {
    // Auth user exists but provisioning has not run (or failed). Treat as
    // unauthenticated so the caller is redirected to a clean state.
    return null
  }

  const roles = (account.user_roles ?? [])
    .map((link) => roleCodeById.get(link.role_id))
    .filter((code): code is AppRole => code != null && isAppRole(code))

  return {
    authUserId,
    legacyUserId: account.legacy_user_id,
    email: account.email,
    fullName: account.full_name,
    phone: account.phone,
    address: account.address,
    avatarUrl: account.avatar_url,
    isActive: account.is_active,
    roles,
  }
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const identity = await getAuthIdentity()
  if (!identity) return null

  const hit = currentUserCache.get(identity.id)
  if (hit && hit.expires > Date.now()) {
    return { ...hit.user, roles: [...hit.user.roles] }
  }

  const user = await loadCurrentUser(identity.id)

  if (user) {
    if (currentUserCache.size >= CURRENT_USER_MAX_ENTRIES) {
      currentUserCache.clear()
    }
    // store a COPY: the caller keeps `user`, and must never be able to change what others get
    currentUserCache.set(identity.id, {
      user: { ...user, roles: [...user.roles] },
      expires: Date.now() + CURRENT_USER_TTL_MS,
    })
  }
  return user
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
