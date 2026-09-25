import { mobileRoute } from '@/lib/api/mobile'
import { getUnreadCount } from '@/services/notifications.service'

export const dynamic = 'force-dynamic'

/** Just the unread count — cheap enough for the app to check every few seconds while it is open. */
export const GET = mobileRoute(
  async () => ({ unread: await getUnreadCount() }),
  {
    roles: ['tenant', 'landlord'],
  },
)
