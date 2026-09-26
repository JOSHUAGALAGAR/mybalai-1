import type { Metadata } from 'next'

import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = { title: 'Sign in' }

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

const NOTICES: Record<string, string> = {
  check_email: 'Almost there — confirm your email address, then sign in.',
  registered: 'Account created. Sign in to continue.',
  reset_done: 'Your password has been updated. Sign in with your new password.',
  deleted:
    'Your account and personal data were deleted. Thank you for using MyBalai.',
  oauth: 'Google sign-in did not complete. Please try again.',
  landlord_google:
    'Landlord accounts sign in with email and password, not Google.',
  provisioning:
    'Your account is not fully set up yet. Sign in again or contact support.',
  session_expired: 'Your session expired. Please sign in again.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const next = first(sp.next)

  let notice: string | undefined
  if (first(sp.check_email)) notice = NOTICES.check_email
  else if (first(sp.registered)) notice = NOTICES.registered
  else if (first(sp.reset) === 'done') notice = NOTICES.reset_done
  else if (first(sp.deleted)) notice = NOTICES.deleted
  else if (first(sp.error) === 'oauth') notice = NOTICES.oauth
  else if (first(sp.error) === 'landlord_google')
    notice = NOTICES.landlord_google
  else if (first(sp.error) === 'provisioning') notice = NOTICES.provisioning
  else if (first(sp.error) === 'session_expired')
    notice = NOTICES.session_expired

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Welcome back to MyBalai.
        </p>
      </div>
      <LoginForm next={next} notice={notice} />
    </div>
  )
}
