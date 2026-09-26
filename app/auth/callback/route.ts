import { NextResponse, type NextRequest } from 'next/server'

import { authMethodsFromClaims } from '@/lib/auth/dal'
import { publicOrigin } from '@/lib/public-origin'
import { createClient } from '@/lib/supabase/server'
import * as usersRepo from '@/repositories/users.repository'

/**
 * OAuth (Google) and password-recovery callback.
 *
 * Supabase redirects here with `?code=...` (PKCE). We exchange it for a
 * session, then forward to `next`. Account provisioning for first-time OAuth
 * users is handled by the `handle_new_user` trigger (role defaults to tenant).
 *
 * Landlord accounts are created for them by MyBalai and must not sign in with Google, so a Google
 * sign-in that lands on a landlord account is signed straight back out. (A password-recovery link
 * also arrives here; that is not an OAuth session and is left alone.)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const origin = publicOrigin(request)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next')
  const next =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: claims } = await supabase.auth.getClaims()
      const usedGoogle = authMethodsFromClaims(claims?.claims).includes('oauth')

      if (usedGoogle && data.user) {
        const account = await usersRepo.getAccountByAuthId(data.user.id)
        const roles = account
          ? await usersRepo.getRoleCodes(account.legacy_user_id)
          : []
        if (roles.includes('landlord')) {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=landlord_google`)
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
