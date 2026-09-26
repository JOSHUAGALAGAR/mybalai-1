import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { UserActiveToggle } from '@/components/admin/user-active-toggle'
import { UserResetPassword } from '@/components/admin/user-reset-password'
import { PageHeader } from '@/components/dashboard/page-header'
import { Badge } from '@/components/ui/badge'
import { requireArea } from '@/lib/auth/dal'
import { getUserForAdmin } from '@/services/admin.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'User' }

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const me = await requireArea('superadmin')
  const userId = Number((await params).userId)
  if (!Number.isInteger(userId) || userId <= 0) notFound()

  let user
  try {
    user = await getUserForAdmin(userId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  const rows: Array<[string, string | null]> = [
    ['Email', user.email],
    ['Phone', user.phone],
    ['Address', user.address],
    [
      'ID verified',
      user.idVerifiedAt ? new Date(user.idVerifiedAt).toLocaleString() : null,
    ],
    ['Joined', new Date(user.createdAt).toLocaleString()],
    [
      'Last login',
      user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : null,
    ],
  ]

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to users
      </Link>
      <PageHeader
        title={user.fullName ?? `User #${user.legacyUserId}`}
        subtitle={`Account #${user.legacyUserId}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        {user.roles.length === 0 ? (
          <span className="text-sm text-muted-foreground">No roles</span>
        ) : (
          user.roles.map((r) => (
            <Badge key={r} variant="outline" className="capitalize">
              {r}
            </Badge>
          ))
        )}
        {user.isActive ? (
          <Badge variant="secondary">Active</Badge>
        ) : (
          <Badge variant="destructive">Deactivated</Badge>
        )}
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border bg-card">
        {rows
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:gap-4"
            >
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm text-foreground">{value}</dd>
            </div>
          ))}
      </dl>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Account access
        </h2>
        <div className="flex flex-wrap items-start gap-3">
          <UserActiveToggle
            userId={user.legacyUserId}
            isActive={user.isActive}
          />
          {!user.roles.includes('superadmin') &&
            user.legacyUserId !== me.legacyUserId && (
              <UserResetPassword
                userId={user.legacyUserId}
                name={
                  user.fullName ?? user.email ?? `user #${user.legacyUserId}`
                }
              />
            )}
        </div>
      </section>
    </div>
  )
}
