import type { Metadata } from 'next'
import Link from 'next/link'

import { ApplicationList } from '@/components/admin/application-review'
import { PageHeader } from '@/components/dashboard/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { requireArea } from '@/lib/auth/dal'
import { APPLICATIONS_SETUP_MESSAGE } from '@/lib/db-errors'
import { cn } from '@/lib/utils'
import { listApplications } from '@/services/applications.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Landlord applications' }
export const dynamic = 'force-dynamic'

const TABS = [
  { status: 'pending', label: 'Waiting for review' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Rejected' },
] as const

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireArea('superadmin')
  const raw = (await searchParams).status
  const status = TABS.find((t) => t.status === raw)?.status ?? 'pending'

  const page = Math.max(
    1,
    Number.parseInt(String((await searchParams).page ?? '1'), 10) || 1,
  )
  let result: Awaited<ReturnType<typeof listApplications>> | null = null
  let needsSetup = false
  try {
    result = await listApplications(status, page)
  } catch (error) {
    if (
      error instanceof ServiceError &&
      error.message === APPLICATIONS_SETUP_MESSAGE
    )
      needsSetup = true
    else throw error
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
        title="Landlord applications"
        subtitle="Property owners apply from the landing page. Approve to create their landlord account, or reject with a reason."
      />
      <nav className="flex gap-1 border-b border-border" aria-label="Status">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={`/admin/applications?status=${t.status}`}
            aria-current={t.status === status ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              t.status === status
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {needsSetup ? (
        <Alert>
          <AlertDescription>{APPLICATIONS_SETUP_MESSAGE}</AlertDescription>
        </Alert>
      ) : (
        <>
          <ApplicationList items={result?.items ?? []} />
          {result && result.pageCount > 1 && (
            <nav
              className="flex items-center justify-between text-sm"
              aria-label="Pages"
            >
              {result.page > 1 ? (
                <Link
                  href={`/admin/applications?status=${status}&page=${result.page - 1}`}
                  className="font-medium text-primary hover:underline"
                >
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                Page {result.page} of {result.pageCount} · {result.total}{' '}
                applications
              </span>
              {result.page < result.pageCount ? (
                <Link
                  href={`/admin/applications?status=${status}&page=${result.page + 1}`}
                  className="font-medium text-primary hover:underline"
                >
                  Next →
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
