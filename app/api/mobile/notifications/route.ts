import { mobileRoute } from '@/lib/api/mobile'
import {
  getUnreadCount,
  listMyNotifications,
} from '@/services/notifications.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute(
  async () => {
    const [items, unread] = await Promise.all([
      listMyNotifications(),
      getUnreadCount(),
    ])
    return { items, unread }
  },
  { roles: ['tenant', 'landlord'] },
)
