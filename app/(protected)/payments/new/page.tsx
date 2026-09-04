import type { Metadata } from 'next'

import { PaymentForm } from '@/components/payment/payment-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { getPaymentFormContext } from '@/services/payments.service'

export const metadata: Metadata = { title: 'Submit payment' }

export default async function NewPaymentPage() {
  await requireArea('tenant', 'superadmin')
  const { bookings, methods } = await getPaymentFormContext()

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Submit payment"
        subtitle="Record a payment for one of your bookings."
      />
      <PaymentForm bookings={bookings} methods={methods} />
    </div>
  )
}
