import { idParam, mobileRoute } from '@/lib/api/mobile'
import { isPaymongoConfigured } from '@/lib/env.server'
import { getMyBooking } from '@/services/bookings.service'
import { listEligibleConversations } from '@/services/mobile-messaging.service'
import { latestPaymentForMyBooking } from '@/services/payments.service'
import { reconcileMyPendingPayments } from '@/services/paymongo.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute<{ id: string }>(async ({ params }) => {
  const bookingId = idParam(params.id)
  await reconcileMyPendingPayments() // see the list route: settle what PayMongo already has as paid
  const [booking, payment, eligible] = await Promise.all([
    getMyBooking(bookingId),
    latestPaymentForMyBooking(bookingId),
    listEligibleConversations(),
  ])
  // The tenant needs neither party's internal ids — except the owner's, and only when messaging
  // is open (booking confirmed and paid), because that is who the chat is with.
  const safe: Partial<typeof booking> = { ...booking }
  delete safe.tenantId
  const owner = booking.propertyOwnerId
  delete safe.propertyOwnerId
  const canMessage =
    owner != null &&
    eligible.some(
      (c) => c.otherUserId === owner && c.propertyId === booking.propertyId,
    )
  return {
    ...safe,
    payment,
    onlinePaymentsAvailable: isPaymongoConfigured(),
    messaging: canMessage
      ? { ownerId: owner, propertyId: booking.propertyId }
      : null,
  }
})
