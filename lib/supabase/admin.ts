import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { publicEnv } from '@/lib/env'
import { serverEnv } from '@/lib/env.server'
import type { Database } from '@/types/database'

/**
 * Privileged Supabase client using the secret (service-role) key.
 *
 * BYPASSES Row Level Security. Only use it inside the service/repository layer
 * after the caller has been authenticated and authorized in application code
 * (see `services/`). Never expose it to a Client Component or a Route Handler
 * that has not run its own authorization checks.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv.supabaseUrl,
    serverEnv.supabaseSecretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
