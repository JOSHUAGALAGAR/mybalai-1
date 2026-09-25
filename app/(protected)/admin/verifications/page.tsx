import type { Metadata } from 'next'
import Link from 'next/link'

import { VerificationTable } from '@/components/admin/verification-table'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import {
  isVerificationSetupProblem,
  VERIFICATION_SETUP_MESSAGE,
} from '@/lib/db-errors'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { listVerificationsForAdmin } from '@/services/verification.service'

export const metadata: Metadata = { title: 'ID verification' }

const TABS = [
  { status: 'pending', label: 'Waiting for review' },
  { status: 'approved', label: 'Verified' },
  { status: 'rejected', label: 'Rejected' },
] as const

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireArea('superadmin')
  const raw = (await searchParams).status
  const status = TABS.find((t) => t.status === raw)?.status ?? 'pending'
  let items: Awaited<ReturnType<typeof listVerificationsForAdmin>> = []
  let needsSetup = false
  try {
    items = await listVerificationsForAdmin(status)
  } catch (error) {
    if (!isVerificationSetupProblem(error)) throw error
    needsSetup = true
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
        title="ID verification"
        subtitle="Tenants upload the front and back of a government ID. Approve it to give them the Verified badge."
      />
      <nav className="flex gap-1 border-b border-border" aria-label="Status">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={`/admin/verifications?status=${t.status}`}
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
          <AlertDescription>{VERIFICATION_SETUP_MESSAGE}</AlertDescription>
        </Alert>
      ) : (
        <VerificationTable items={items} />
      )}
    </div>
  )
}
