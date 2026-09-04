import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MessageThread } from '@/components/messaging/message-thread'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireUser } from '@/lib/auth/dal'
import { getConversation } from '@/services/messaging.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Conversation' }

type SearchParams = Record<string, string | string[] | undefined>

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ otherUserId: string }>
  searchParams: Promise<SearchParams>
}) {
  await requireUser()
  const otherUserId = Number((await params).otherUserId)
  const rawProp = (await searchParams).property
  const propertyId = Number(Array.isArray(rawProp) ? rawProp[0] : rawProp)

  if (
    !Number.isInteger(otherUserId) ||
    otherUserId <= 0 ||
    !Number.isInteger(propertyId) ||
    propertyId <= 0
  ) {
    notFound()
  }

  let data
  try {
    data = await getConversation(otherUserId, propertyId)
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'forbidden')
    ) {
      notFound()
    }
    throw error
  }

  return (
    <div className="space-y-4">
      <Link
        href="/messages"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← All messages
      </Link>
      <PageHeader
        title={data.meta.otherName ?? `User #${data.meta.otherUserId}`}
        subtitle={data.meta.propertyName ?? undefined}
      />
      <MessageThread meta={data.meta} initialMessages={data.messages} />
    </div>
  )
}
