import { idParam, mobileRoute } from '@/lib/api/mobile'
import { getMyPaymentSummary } from '@/services/payments.service'
import { reconcilePayment } from '@/services/paymongo.service'

export const dynamic = 'force-dynamic'

/**
 * The payment's current state. If it is still pending we ask PayMongo directly (the same
 * server-side check the website's return page does), so the app doesn't depend on the webhook
 * having arrived. `status` is the reconciled outcome.
 */
export const GET = mobileRoute<{ id: string }>(async ({ params }) => {
  const paymentId = idParam(params.id)
  const { status } = await reconcilePayment(paymentId)
  const summary = await getMyPaymentSummary(paymentId)
  return { ...summary, status }
})
