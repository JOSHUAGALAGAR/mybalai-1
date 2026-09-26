import type { Metadata } from 'next'
import Link from 'next/link'

import { AuditTable } from '@/components/admin/audit-table'
import { PageHeader } from '@/components/dashboard/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AUDIT_GROUPS } from '@/lib/audit/actions'
import { requireArea } from '@/lib/auth/dal'
import {
  ADMIN_TOOLS_SETUP_MESSAGE,
  isAdminToolsSetupProblem,
} from '@/lib/db-errors'
import { listAuditLog } from '@/services/audit.service'

export const metadata: Metadata = { title: 'Audit logs' }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) =>
  typeof v === 'string' ? v : ''
const DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('superadmin')
  const sp = await searchParams
  const group =
    AUDIT_GROUPS.find((g) => g.prefix === one(sp.group))?.prefix ?? ''
  const q = one(sp.q).trim().slice(0, 80)
  const from = DATE.test(one(sp.from)) ? one(sp.from) : ''
  const to = DATE.test(one(sp.to)) ? one(sp.to) : ''
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1)

  let result: Awaited<ReturnType<typeof listAuditLog>> | null = null
  let needsSetup = false
  try {
    result = await listAuditLog({
      page,
      group: group || undefined,
      q: q || undefined,
      from: from ? `${from}T00:00:00+08:00` : undefined,
      to: to ? `${to}T23:59:59+08:00` : undefined,
    })
  } catch (error) {
    if (!isAdminToolsSetupProblem(error)) throw error
    needsSetup = true
  }

  const link = (p: number) => {
    const params = new URLSearchParams()
    if (group) params.set('group', group)
    if (q) params.set('q', q)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/admin/audit-logs${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-4">
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to admin
      </Link>
      <PageHeader
        title="Audit logs"
        subtitle="A permanent record of sensitive actions: who did what, and when. Entries cannot be edited or deleted."
      />

      {needsSetup || !result ? (
        <Alert>
          <AlertDescription>{ADMIN_TOOLS_SETUP_MESSAGE}</AlertDescription>
        </Alert>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                Type
              </span>
              <select
                name="group"
                defaultValue={group}
                className="h-11 rounded-2xl border border-input bg-background px-4 text-sm"
              >
                <option value="">Everything</option>
                {AUDIT_GROUPS.map((g) => (
                  <option key={g.prefix} value={g.prefix}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                Search
              </span>
              <Input
                name="q"
                defaultValue={q}
                placeholder="Name or description…"
                className="w-56"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                From
              </span>
              <Input
                type="date"
                name="from"
                defaultValue={from}
                className="w-40"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                To
              </span>
              <Input type="date" name="to" defaultValue={to} className="w-40" />
            </label>
            <Button type="submit">Filter</Button>
            {(group || q || from || to) && (
              <Button asChild variant="ghost">
                <Link href="/admin/audit-logs">Clear</Link>
              </Button>
            )}
          </form>

          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'entry' : 'entries'}
          </p>
          <AuditTable rows={result.rows} />

          {result.pageCount > 1 && (
            <nav
              className="flex items-center justify-between text-sm"
              aria-label="Pages"
            >
              {page > 1 ? (
                <Link
                  href={link(page - 1)}
                  className="font-medium text-primary hover:underline"
                >
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                Page {result.page} of {result.pageCount}
              </span>
              {page < result.pageCount ? (
                <Link
                  href={link(page + 1)}
                  className="font-medium text-primary hover:underline"
                >
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  )
}
