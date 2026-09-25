import { mobileRoute } from '@/lib/api/mobile'
import { getLandlordDashboard } from '@/services/landlord-dashboard.service'
import { getUnreadCount } from '@/services/notifications.service'

export const dynamic = 'force-dynamic'

const countOf = (
  byStatus: { code: string; count: number }[],
  ...codes: string[]
) =>
  byStatus
    .filter((s) => codes.includes(s.code))
    .reduce((n, s) => n + s.count, 0)

export const GET = mobileRoute(
  async () => {
    const [dashboard, unreadNotifications] = await Promise.all([
      getLandlordDashboard(),
      getUnreadCount(),
    ])
    const { byStatus } = dashboard.bookings
    return {
      ...dashboard,
      unreadNotifications,
      counts: {
        pendingRequests: countOf(byStatus, 'pending'),
        awaitingPayment: countOf(byStatus, 'payment_pending'),
        confirmed: countOf(byStatus, 'confirmed'),
        checkedIn: countOf(byStatus, 'checked_in'),
      },
    }
  },
  { roles: ['landlord'] },
)
