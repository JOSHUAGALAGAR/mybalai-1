'use client'

import Link from 'next/link'

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/(protected)/notifications/actions'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { NotificationItem } from '@/services/notifications.service'

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const hasUnread = items.some((n) => !n.isRead)

  if (items.length === 0) {
    return (
      <EmptyState
        title="No notifications"
        description="Booking, payment, inquiry, and message activity shows up here."
      />
    )
  }

  return (
    <div className="space-y-3">
      {hasUnread && (
        <form action={markAllNotificationsReadAction}>
          <Button type="submit" variant="outline" size="sm">
            Mark all as read
          </Button>
        </form>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((n) => (
          <li
            key={n.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3',
              !n.isRead && 'bg-muted/40',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {n.href ? (
                  <Link href={n.href} className="hover:underline">
                    {n.title}
                  </Link>
                ) : (
                  n.title
                )}
              </p>
              <p className="text-sm text-muted-foreground">{n.message}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </div>
            {!n.isRead && (
              <form action={markNotificationReadAction}>
                <input type="hidden" name="id" value={n.id} />
                <Button type="submit" variant="ghost" size="xs">
                  Mark read
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
