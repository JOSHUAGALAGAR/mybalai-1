import Link from 'next/link'

import { EmptyState } from '@/components/ui/empty-state'
import type { ConversationSummary } from '@/services/messaging.service'

export function ConversationList({ items }: { items: ConversationSummary[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No conversations"
        description="Start a conversation from a booking or a property inquiry."
      />
    )
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((c) => (
        <li key={`${c.otherUserId}:${c.propertyId ?? 'none'}`}>
          <Link
            href={`/messages/${c.otherUserId}${c.propertyId ? `?property=${c.propertyId}` : ''}`}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {c.otherName ?? `User #${c.otherUserId}`}
                {c.propertyName && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {c.propertyName}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {c.lastMessage}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-[10px] text-muted-foreground">
                {new Date(c.lastAt).toLocaleDateString()}
              </span>
              {c.unread > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
                  {c.unread}
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
