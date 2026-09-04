import type { NextRequest } from 'next/server'

import { updateSession } from '@/lib/supabase/proxy'

// Next.js 16 renamed `middleware` -> `proxy` (nodejs runtime, not edge).
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - Next.js internals (_next/static, _next/image)
     * - favicon and common static image assets
     * Auth routes are matched on purpose so sessions refresh there too.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
