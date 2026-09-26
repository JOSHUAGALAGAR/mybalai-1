import type { Metadata } from 'next'
import Link from 'next/link'

import { UserTable } from '@/components/admin/user-table'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { nativeControlClass } from '@/components/ui/form-field'
import { requireArea } from '@/lib/auth/dal'
import { cn } from '@/lib/utils'
import { listUsersPage } from '@/services/admin.service'

export const metadata: Metadata = { title: 'Users' }

type SearchParams = Record<string, string | string[] | undefined>

const ROLES = [
  { value: '', label: 'All' },
  { value: 'tenant', label: 'Tenants' },
  { value: 'landlord', label: 'Landlords' },
  { value: 'caretaker', label: 'Caretakers' },
  { value: 'superadmin', label: 'Admins' },
] as const
const STATES = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'verified', label: 'ID verified' },
  { value: 'unverified', label: 'Not ID verified' },
] as const
const PAGE_SIZE = 25
const one = (v: string | string[] | undefined) =>
  typeof v === 'string' ? v : ''

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const me = await requireArea('superadmin')
  const sp = await searchParams
  const q = one(sp.q)
  const role = ROLES.find((r) => r.value === one(sp.role))?.value ?? ''
  const state = STATES.find((s) => s.value === one(sp.state))?.value ?? ''
  const pageParam = Math.max(1, Number.parseInt(one(sp.page), 10) || 1)
  const { rows: users, total } = await listUsersPage({
    q,
    role: role || undefined,
    state: (state || undefined) as
      'active' | 'deactivated' | 'verified' | 'unverified' | undefined,
    page: pageParam,
    pageSize: PAGE_SIZE,
  })
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(pageCount, pageParam)

  const href = (over: Record<string, string | number>) => {
    const params = new URLSearchParams()
    const next = { q, role, state, page: 1, ...over }
    for (const [k, v] of Object.entries(next))
      if (v && !(k === 'page' && v === 1)) params.set(k, String(v))
    const qs = params.toString()
    return `/admin/users${qs ? `?${qs}` : ''}`
  }

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
        subtitle={`${total} ${total === 1 ? 'account' : 'accounts'}`}
      />

      <div className="mb-3 flex flex-wrap gap-1 text-sm" aria-label="Role">
        {ROLES.map((r) => (
          <Link
            key={r.value}
            href={href({ role: r.value })}
            aria-current={r.value === role ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 font-medium',
              r.value === role
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        {role && <input type="hidden" name="role" value={role} />}
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search name or email…"
          aria-label="Search users"
          className="max-w-sm"
        />
        <select
          name="state"
          defaultValue={state}
          aria-label="Status"
          className={cn(nativeControlClass, 'w-auto')}
        >
          {STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <UserTable users={users} currentUserId={me.legacyUserId} />

      {pageCount > 1 && (
        <nav
          className="mt-4 flex items-center justify-between text-sm"
          aria-label="Pages"
        >
          {page > 1 ? (
            <Link
              href={href({ page: page - 1 })}
              className="font-medium text-primary hover:underline"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={href({ page: page + 1 })}
              className="font-medium text-primary hover:underline"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
