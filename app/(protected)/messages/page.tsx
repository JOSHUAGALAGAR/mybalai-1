import type { Metadata } from 'next'

import { ConversationList } from '@/components/messaging/conversation-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireUser } from '@/lib/auth/dal'
import { listMyConversations } from '@/services/messaging.service'

export const metadata: Metadata = { title: 'Messages' }

export default async function MessagesPage() {
  await requireUser()
  const conversations = await listMyConversations()

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle={`${conversations.length} ${conversations.length === 1 ? 'conversation' : 'conversations'}`}
      />
      <ConversationList items={conversations} />
    </div>
  )
}
