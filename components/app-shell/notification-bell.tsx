'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export function NotificationBell({
  initialUnread,
  userId,
}: {
  initialUnread: number
  userId: number
}) {
  const [unread, setUnread] = useState(initialUnread)
  const [syncedInitial, setSyncedInitial] = useState(initialUnread)

  // Re-sync when the server-rendered count changes (navigation / revalidate).
  if (initialUnread !== syncedInitial) {
    setSyncedInitial(initialUnread)
    setUnread(initialUnread)
  }

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => setUnread((n) => n + 1),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  return (
    <Link
      href="/notifications"
      onClick={() => setUnread(0)}
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-medium text-primary-foreground',
          )}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}
