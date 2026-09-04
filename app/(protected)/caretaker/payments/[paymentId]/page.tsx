import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PaymentDetailView } from '@/components/payment/payment-detail-view'
import { requireArea } from '@/lib/auth/dal'
import { getManagedPayment } from '@/services/payments.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Payment' }

export default async function CaretakerPaymentDetailPage({
  params,
}: {
  params: Promise<{ paymentId: string }>
}) {
  await requireArea('caretaker', 'superadmin')
  const paymentId = Number((await params).paymentId)
  if (!Number.isInteger(paymentId) || paymentId <= 0) notFound()

  let detail
  try {
    detail = await getManagedPayment(paymentId)
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'forbidden')
    ) {
      notFound()
    }
    throw error
  }

  return (
    <div className="space-y-6">
      <Link
        href="/caretaker/payments"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to payments
      </Link>
      <PaymentDetailView
        detail={detail}
        mode={{ kind: 'manage', backTo: '/caretaker/payments' }}
      />
    </div>
  )
}
