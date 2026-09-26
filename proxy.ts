import { NextResponse, type NextRequest } from 'next/server'

import { updateSession } from '@/lib/supabase/proxy'

// Next.js 16 renamed `middleware` -> `proxy` (nodejs runtime, not edge).
export async function proxy(request: NextRequest) {
  // If Supabase could not use our redirect address (it is not in the project's allow-list) it sends
  // the sign-in code to the site root instead. Pass it on to the callback so the person still ends up
  // signed in rather than on the home page with a stray ?code=.
  const { pathname, searchParams } = request.nextUrl
  if (pathname === '/' && searchParams.has('code')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }
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
