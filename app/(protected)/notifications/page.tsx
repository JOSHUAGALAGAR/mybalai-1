import type { Metadata } from 'next'

import { NotificationList } from '@/components/notifications/notification-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireUser } from '@/lib/auth/dal'
import { getNotifications } from '@/services/notifications.service'

export const metadata: Metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  await requireUser()
  const items = await getNotifications()
  const unread = items.filter((n) => !n.isRead).length

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}
      />
      <NotificationList items={items} />
    </div>
  )
}
