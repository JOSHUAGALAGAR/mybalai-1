import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PaymentDetailView } from '@/components/payment/payment-detail-view'
import { PaymentSettlementPoller } from '@/components/payment/payment-settlement-poller'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { requireArea } from '@/lib/auth/dal'
import { getMyPayment } from '@/services/payments.service'
import { isPaymongoConfigured } from '@/services/paymongo.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Payment' }

type SearchParams = Record<string, string | string[] | undefined>

export default async function PaymentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>
  searchParams: Promise<SearchParams>
}) {
  await requireArea('tenant', 'superadmin')
  const paymentId = Number((await params).paymentId)
  if (!Number.isInteger(paymentId) || paymentId <= 0) notFound()
  const sp = await searchParams
  const created = Boolean(sp.created)
  const paid = Boolean(sp.paid)

  let detail
  try {
    detail = await getMyPayment(paymentId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  return (
    <div className="space-y-6">
      <Link
        href="/payments"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to payments
      </Link>
      {created && (
        <Alert>
          <AlertDescription>
            Payment recorded. Attach a receipt below so the landlord can verify
            it.
          </AlertDescription>
        </Alert>
      )}
      {paid && isPaymongoConfigured() && (
        <PaymentSettlementPoller
          paymentId={paymentId}
          initialStatus={detail.statusCode}
        />
      )}
      <PaymentDetailView
        detail={detail}
        mode={{ kind: 'tenant' }}
        onlinePaymentEnabled={isPaymongoConfigured()}
      />
    </div>
  )
}
