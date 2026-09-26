import type { Metadata } from 'next'

import { PageHeader } from '@/components/dashboard/page-header'
import { AvatarUploader } from '@/components/settings/avatar-uploader'
import { DeleteAccountCard } from '@/components/settings/delete-account-card'
import { IdVerificationCard } from '@/components/settings/id-verification-card'
import { PasswordForm } from '@/components/settings/password-form'
import { ProfileForm } from '@/components/settings/profile-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { requireUser } from '@/lib/auth/dal'
import { ROLE_LABELS } from '@/lib/auth/roles'
import {
  isVerificationSetupProblem,
  VERIFICATION_SETUP_MESSAGE,
} from '@/lib/db-errors'
import { createClient } from '@/lib/supabase/server'
import {
  checkAccountDeletion,
  type DeletionCheck,
} from '@/services/account-deletion.service'
import {
  getMyVerification,
  type MyVerification,
} from '@/services/verification.service'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {description && (
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{description}</p>
      )}
      {!description && <div className="mb-3" />}
      {children}
    </section>
  )
}

export default async function SettingsPage() {
  const user = await requireUser()
  const isTenant = user.roles.includes('tenant')

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  const providers =
    (authUser?.app_metadata?.providers as string[] | undefined) ?? []
  const hasPassword = providers.includes('email')

  let verification: MyVerification | null = null
  let verificationSetup = false
  if (isTenant) {
    try {
      verification = await getMyVerification()
    } catch (error) {
      if (!isVerificationSetupProblem(error)) throw error
      verificationSetup = true
    }
  }

  // Only tenants and landlords may delete their own account (see the deletion service).
  let deletion: DeletionCheck | null = null
  try {
    deletion = await checkAccountDeletion()
  } catch {
    deletion = null
  }

  const initials = (user.fullName ?? user.email ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Your account, photo, password and contact details."
      />

      <dl className="mb-10 grid gap-3 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-[140px_1fr]">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="text-foreground">{user.email ?? '—'}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd className="text-foreground">
          {user.roles.map((role) => ROLE_LABELS[role]).join(', ') || '—'}
        </dd>
        <dt className="text-muted-foreground">Account status</dt>
        <dd className="text-foreground">
          {user.isActive ? 'Active' : 'Inactive'}
        </dd>
      </dl>

      <Section title="Profile">
        <div className="mb-6">
          <AvatarUploader initialUrl={user.avatarUrl} initials={initials} />
        </div>
        <ProfileForm
          initial={{
            fullName: user.fullName ?? '',
            phone: user.phone ?? '',
            address: user.address ?? '',
          }}
        />
      </Section>

      <Section
        title="Password"
        description={
          hasPassword ? 'Change the password you sign in with.' : undefined
        }
      >
        {hasPassword ? (
          <PasswordForm />
        ) : (
          <p className="text-sm text-muted-foreground">
            You sign in with Google, so there is no password to change here.
          </p>
        )}
      </Section>

      {isTenant && (
        <Section
          title="ID verification"
          description="Get a Verified badge that landlords can see on your booking requests."
        >
          {verificationSetup ? (
            <Alert>
              <AlertDescription>{VERIFICATION_SETUP_MESSAGE}</AlertDescription>
            </Alert>
          ) : (
            verification && <IdVerificationCard initial={verification} />
          )}
        </Section>
      )}

      {deletion && (
        <Section title="Delete account">
          {hasPassword ? (
            <DeleteAccountCard
              blockers={deletion.blockers}
              role={deletion.role}
            />
          ) : (
            <p className="max-w-lg text-sm text-muted-foreground">
              You sign in with Google. To delete your account, open the MyBalai
              app: Profile → Delete account.
            </p>
          )}
        </Section>
      )}
    </div>
  )
}
