import { mobileRoute } from '@/lib/api/mobile'
import { listMobileConversations } from '@/services/mobile-messaging.service'

export const dynamic = 'force-dynamic'

/** Conversations the caller may have: confirmed-and-paid bookings only. */
export const GET = mobileRoute(
  async () => {
    const items = await listMobileConversations()
    return { items, unread: items.reduce((n, c) => n + c.unread, 0) }
  },
  { roles: ['tenant', 'landlord'] },
)
