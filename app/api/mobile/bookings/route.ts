import { mobileRoute } from '@/lib/api/mobile'
import { listMyBookings } from '@/services/bookings.service'
import { reconcileMyPendingPayments } from '@/services/paymongo.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute(async () => {
  // A QR payment made in another app never reaches us by itself when the webhook cannot: ask
  // PayMongo before listing, so a paid booking does not keep saying "payment pending".
  await reconcileMyPendingPayments()
  return { items: await listMyBookings() }
})
