'use client'

import { createBrowserClient } from '@supabase/ssr'

import { publicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Supabase client for Client Components. Uses the publishable (anon) key and is
 * subject to Row Level Security.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
  )
}
