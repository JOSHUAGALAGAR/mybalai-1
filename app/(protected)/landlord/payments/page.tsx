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

export default async function LandlordPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('landlord', 'superadmin')
  const raw = (await searchParams).status
  const status = typeof raw === 'string' && VALID.has(raw) ? raw : null

  const payments = await listManagedPayments('landlord', status ?? undefined)

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={`${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}`}
      />
      <PaymentStatusTabs basePath="/landlord/payments" active={status} />
      <PaymentList
        items={payments}
        basePath="/landlord/payments"
        showPayer
        emptyTitle="No payments"
        emptyDescription="Payments for your properties will appear here."
      />
    </div>
  )
}
