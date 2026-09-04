import type { Metadata } from 'next'
import Link from 'next/link'

import { UserTable } from '@/components/admin/user-table'
import { PageHeader } from '@/components/dashboard/page-header'
import { Input } from '@/components/ui/input'
import { requireArea } from '@/lib/auth/dal'
import { listUsers } from '@/services/admin.service'

export const metadata: Metadata = { title: 'Users' }

type SearchParams = Record<string, string | string[] | undefined>

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('superadmin')
  const qParam = (await searchParams).q
  const q = typeof qParam === 'string' ? qParam : ''
  const users = await listUsers(q)

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to admin
      </Link>
      <PageHeader
        title="Users"
        subtitle={`${users.length} ${users.length === 1 ? 'account' : 'accounts'}`}
      />
      <form method="get" className="mb-4 max-w-sm">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search name or email…"
          aria-label="Search users"
        />
      </form>
      <UserTable users={users} />
    </div>
  )
}
