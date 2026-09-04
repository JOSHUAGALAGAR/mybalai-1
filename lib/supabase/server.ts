import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

import { publicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Uses the publishable (anon) key and the caller's session cookie, so it is
 * subject to Row Level Security.
 *
 * Session refresh is handled by `proxy.ts`; the `setAll` catch here covers the
 * case where this client is used from a Server Component (cookies are
 * read-only there).
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component. Safe to ignore — `proxy.ts`
            // refreshes the session on the next request.
          }
        },
      },
    },
  )
}
