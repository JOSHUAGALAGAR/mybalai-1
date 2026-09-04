import type { Metadata } from 'next'

import { PageHeader } from '@/components/dashboard/page-header'
import { ProfileForm } from '@/components/settings/profile-form'
import { requireUser } from '@/lib/auth/dal'
import { ROLE_LABELS } from '@/lib/auth/roles'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const user = await requireUser()

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Your account and contact details."
      />

      <dl className="mb-8 grid gap-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-[140px_1fr]">
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

      <h2 className="mb-3 text-sm font-semibold text-foreground">Profile</h2>
      <ProfileForm
        initial={{
          fullName: user.fullName ?? '',
          phone: user.phone ?? '',
          address: user.address ?? '',
        }}
      />
    </div>
  )
}
