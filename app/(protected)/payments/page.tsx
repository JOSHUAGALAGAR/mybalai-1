import type { Metadata } from 'next'
import Link from 'next/link'

import { PaymentList } from '@/components/payment/payment-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { requireArea } from '@/lib/auth/dal'
import { listMyPayments } from '@/services/payments.service'

export const metadata: Metadata = { title: 'Payments' }

export default async function PaymentsPage() {
  await requireArea('tenant', 'superadmin')
  const payments = await listMyPayments()

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={`${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}`}
        actions={
          <Button asChild>
            <Link href="/payments/new">Submit payment</Link>
          </Button>
        }
      />
      <PaymentList
        items={payments}
        basePath="/payments"
        emptyTitle="No payments yet"
        emptyDescription="Submit a payment against one of your bookings."
      />
    </div>
  )
}
