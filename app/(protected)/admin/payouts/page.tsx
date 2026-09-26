import type { Metadata } from 'next'
import Link from 'next/link'

import { PayoutRequests } from '@/components/admin/payout-requests'
import { PayoutSettingsForm } from '@/components/admin/payout-settings-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { requireArea } from '@/lib/auth/dal'
import { PAYOUT_SETUP_MESSAGE, isPayoutSetupProblem } from '@/lib/db-errors'
import { cn } from '@/lib/utils'
import {
  getPayoutRulesForAdmin,
  listPayoutsForAdmin,
} from '@/services/payouts.service'

export const metadata: Metadata = { title: 'Payouts & fees' }
export const dynamic = 'force-dynamic'

const TABS = [
  { status: 'pending', label: 'Waiting to be paid' },
  { status: 'completed', label: 'Paid' },
  { status: 'failed', label: 'Rejected' },
] as const

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireArea('superadmin')
  const raw = (await searchParams).status
  const status = TABS.find((t) => t.status === raw)?.status ?? 'pending'

  let rules: Awaited<ReturnType<typeof getPayoutRulesForAdmin>> | null = null
  let items: Awaited<ReturnType<typeof listPayoutsForAdmin>> = []
  let needsSetup = false
  try {
    ;[rules, items] = await Promise.all([
      getPayoutRulesForAdmin(),
      listPayoutsForAdmin(status === 'pending' ? undefined : status),
    ])
    if (status === 'pending')
      items = items.filter(
        (i) => i.status === 'pending' || i.status === 'processing',
      )
  } catch (error) {
    if (
      !isPayoutSetupProblem(error) &&
      !(error instanceof Error && error.message === PAYOUT_SETUP_MESSAGE)
    )
      throw error
    needsSetup = true
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to admin
        </Link>
        <PageHeader
          title="Payouts & fees"
          subtitle="Set the fees taken from online payments, when landlords can withdraw, and pay out their requests."
        />
      </div>

      {needsSetup || !rules ? (
        <Alert>
          <AlertDescription>{PAYOUT_SETUP_MESSAGE}</AlertDescription>
        </Alert>
      ) : (
        <>
          <section aria-label="Settings">
            <PayoutSettingsForm rules={rules} />
          </section>

          <section aria-label="Withdrawal requests" className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">
              Withdrawal requests
            </h2>
            <nav
              className="flex gap-1 border-b border-border"
              aria-label="Status"
            >
              {TABS.map((t) => (
                <Link
                  key={t.status}
                  href={`/admin/payouts?status=${t.status}`}
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
            <PayoutRequests items={items} />
          </section>
        </>
      )}
    </div>
  )
}
