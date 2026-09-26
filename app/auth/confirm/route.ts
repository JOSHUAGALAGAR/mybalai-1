import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

import { publicOrigin } from '@/lib/public-origin'
import { createClient } from '@/lib/supabase/server'

/**
 * Handles the email confirmation / magic-link callback.
 *
 * Not exercised while "Confirm email" is disabled in the Supabase dashboard,
 * but wired up so enabling it later needs no code change. Point the project's
 * "Confirm signup" email template at {{ .SiteURL }}/auth/confirm?token_hash=...
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'
  const redirectTo =
    next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })
    if (!error) {
      return NextResponse.redirect(new URL(redirectTo, publicOrigin(request)))
    }
  }

  return NextResponse.redirect(
    new URL('/login?error=confirmation', publicOrigin(request)),
  )
}
