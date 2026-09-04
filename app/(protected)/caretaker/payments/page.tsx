import type { Metadata } from 'next'

import { PaymentList } from '@/components/payment/payment-list'
import { PaymentStatusTabs } from '@/components/payment/payment-status-tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { listManagedPayments } from '@/services/payments.service'

export const metadata: Metadata = { title: 'Payments' }

const VALID = new Set([
  'pending',
  'paid',
  'rejected',
  'cancelled',
  'unpaid',
  'refunded',
])
type SearchParams = Record<string, string | string[] | undefined>

export default async function CaretakerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('caretaker', 'superadmin')
  const raw = (await searchParams).status
  const status = typeof raw === 'string' && VALID.has(raw) ? raw : null

  const payments = await listManagedPayments('caretaker', status ?? undefined)

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={`${payments.length} ${payments.length === 1 ? 'payment' : 'payments'} · view only`}
      />
      <PaymentStatusTabs basePath="/caretaker/payments" active={status} />
      <PaymentList
        items={payments}
        basePath="/caretaker/payments"
        showPayer
        emptyTitle="No payments"
        emptyDescription="Payments for your assigned properties will appear here."
      />
    </div>
  )
}
