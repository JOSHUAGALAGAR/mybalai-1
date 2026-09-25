import { idParam, mobileRoute } from '@/lib/api/mobile'
import * as usersRepo from '@/repositories/users.repository'
import { getManagedBooking } from '@/services/bookings.service'
import { listEligibleConversations } from '@/services/mobile-messaging.service'

export const dynamic = 'force-dynamic'

/**
 * One booking, seen by its landlord. Tenant contact details and messaging are only offered once
 * the booking is confirmed AND paid — before that the landlord sees the request, not the person.
 */
export const GET = mobileRoute<{ id: string }>(
  async ({ params }) => {
    const booking = await getManagedBooking(idParam(params.id))
    const eligible = (await listEligibleConversations()).some(
      (c) =>
        c.otherUserId === booking.tenantId &&
        c.propertyId === booking.propertyId,
    )
    const account = eligible
      ? await usersRepo.getAccountById(booking.tenantId)
      : null

    const { propertyOwnerId: _owner, ...safe } = booking
    void _owner
    return {
      ...safe,
      canMessage: eligible,
      tenantContact: account
        ? { email: account.email, phone: account.phone }
        : null,
    }
  },
  { roles: ['landlord'] },
)
