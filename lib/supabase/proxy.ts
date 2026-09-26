import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Paths reachable without a session: the public marketing site (Phase 1) and
 * the auth routes (Phase 2). Everything else requires authentication.
 */
const PUBLIC_EXACT_PATHS = new Set([
  '/',
  '/forgot-password',
  // Legal pages are linked from sign-up, the mobile app and Google's consent screen.
  '/terms',
  '/privacy',
  '/cookies',
  // How to delete your account: linked from Google Play's Data safety form.
  '/delete-account',
  // Property owners apply to become a landlord without an account.
  '/apply',
  // PayMongo returns the tenant's phone browser here; it only redirects into the app.
  '/pay/return',
  // The Android app (APK) download linked from the landing page.
  '/download/android',
])
const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/signup',
  '/auth',
  // Third-party webhooks authenticate themselves (signature), not via a session.
  '/api/paymongo',
  // The mobile API authenticates with a bearer token (no cookie session), so
  // the cookie gate must not redirect it; every handler checks the token itself
  // (see `lib/api/mobile.ts`).
  '/api/mobile',
]

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/**
 * Runs on every matched request (see `proxy.ts` root file):
 *  1. Refreshes the Supabase auth session and writes rotated cookies.
 *  2. Redirects unauthenticated users away from protected routes.
 *  3. Redirects authenticated users away from the auth screens.
 *
 * This is a coarse gate only. Pages, Server Actions and the service layer each
 * perform their own checks (see `lib/auth/dal.ts`).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          supabaseResponse = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // IMPORTANT: nothing between createServerClient and getClaims(). It refreshes an expiring session
  // (writing the rotated cookies) and verifies the JWT locally — no round trip to Supabase Auth.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims ? { id: data.claims.sub } : null

  const { pathname } = request.nextUrl
  const publicPath = isPublicPath(pathname)

  if (!user && !publicPath) {
    return redirectWithSessionCookies(request, supabaseResponse, '/login', {
      next: pathname,
    })
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    return redirectWithSessionCookies(request, supabaseResponse, '/dashboard')
  }

  return supabaseResponse
}

function redirectWithSessionCookies(
  request: NextRequest,
  sessionResponse: NextResponse,
  destination: string,
  query: Record<string, string> = {},
) {
  const url = request.nextUrl.clone()
  url.pathname = destination
  url.search = ''
  for (const [key, value] of Object.entries(query)) {
    if (value && value !== '/') url.searchParams.set(key, value)
  }

  const redirectResponse = NextResponse.redirect(url)
  for (const cookie of sessionResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie)
  }
  return redirectResponse
}
