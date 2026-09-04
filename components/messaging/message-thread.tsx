'use client'

import { useActionState, useEffect, useRef, useState } from 'react'

import {
  editMessageAction,
  sendMessageAction,
  type MessageActionState,
} from '@/app/(protected)/messages/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type {
  ChatMessage,
  ConversationMeta,
} from '@/services/messaging.service'

function EditMessageForm({
  messageId,
  body,
  onDone,
}: {
  messageId: number
  body: string
  onDone: () => void
}) {
  const [state, action, pending] = useActionState<MessageActionState, FormData>(
    editMessageAction,
    undefined,
  )
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (submitted && !pending && state === undefined) onDone()
  }, [submitted, pending, state, onDone])

  return (
    <form
      action={action}
      className="space-y-1"
      onSubmit={() => setSubmitted(true)}
    >
      <input type="hidden" name="message_id" value={messageId} />
      <Textarea
        name="message"
        defaultValue={body}
        rows={2}
        className="bg-background text-foreground"
        required
      />
      {state?.status === 'error' && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
      <div className="flex gap-1">
        <Button type="submit" size="xs">
          Save
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function MessageThread({
  meta,
  initialMessages,
}: {
  meta: ConversationMeta
  initialMessages: ChatMessage[]
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [sendState, sendAction] = useActionState<MessageActionState, FormData>(
    sendMessageAction,
    undefined,
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (sendState === undefined) formRef.current?.reset()
  }, [sendState])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  // Clear the reply bar whenever a message arrives (incl. our own via realtime).
  const [prevCount, setPrevCount] = useState(messages.length)
  if (messages.length !== prevCount) {
    setPrevCount(messages.length)
    setReplyTo(null)
  }

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`chat-${meta.otherUserId}-${meta.propertyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `property_id=eq.${meta.propertyId}`,
        },
        (payload) => {
          const row = (payload.new ?? {}) as Record<string, unknown>
          const senderId = Number(row.sender_id)
          const receiverId = Number(row.receiver_id)
          if (
            senderId !== meta.otherUserId &&
            receiverId !== meta.otherUserId
          ) {
            return
          }
          const item: ChatMessage = {
            messageId: Number(row.message_id),
            mine: senderId !== meta.otherUserId,
            senderName: senderId === meta.otherUserId ? meta.otherName : 'You',
            body: String(row.message ?? ''),
            isEdited: Boolean(row.is_edited),
            createdAt: String(row.created_at ?? new Date().toISOString()),
            replyTo: null,
          }
          setMessages((prev) => {
            const i = prev.findIndex((m) => m.messageId === item.messageId)
            if (i === -1) return [...prev, item]
            const copy = prev.slice()
            copy[i] = { ...copy[i], body: item.body, isEdited: item.isEdited }
            return copy
          })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [meta.otherUserId, meta.propertyId, meta.otherName])

  return (
    <div className="flex h-[70dvh] flex-col rounded-lg border border-border">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No messages yet. Say hello.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.messageId}
            className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                m.mine
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground',
              )}
            >
              {m.replyTo && (
                <p
                  className={cn(
                    'mb-1 border-l-2 pl-2 text-xs',
                    m.mine
                      ? 'border-primary-foreground/40 text-primary-foreground/80'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  {m.replyTo.senderName ?? 'Someone'}:{' '}
                  {m.replyTo.body.slice(0, 80)}
                </p>
              )}
              {editing === m.messageId ? (
                <EditMessageForm
                  messageId={m.messageId}
                  body={m.body}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <p className="whitespace-pre-wrap">{m.body}</p>
              )}
              <p
                className={cn(
                  'mt-1 text-[10px]',
                  m.mine
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground',
                )}
              >
                {new Date(m.createdAt).toLocaleString()}
                {m.isEdited && ' · edited'}
                {!m.mine && (
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => setReplyTo(m)}
                  >
                    reply
                  </button>
                )}
                {m.mine && editing !== m.messageId && (
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => setEditing(m.messageId)}
                  >
                    edit
                  </button>
                )}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        ref={formRef}
        action={sendAction}
        className="border-t border-border p-3"
      >
        <input type="hidden" name="receiver_id" value={meta.otherUserId} />
        <input type="hidden" name="property_id" value={meta.propertyId} />
        <input
          type="hidden"
          name="reply_to_message_id"
          value={replyTo?.messageId ?? ''}
        />
        {replyTo && (
          <p className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Replying to {replyTo.senderName ?? 'message'}:{' '}
              {replyTo.body.slice(0, 60)}
            </span>
            <button
              type="button"
              className="underline"
              onClick={() => setReplyTo(null)}
            >
              cancel
            </button>
          </p>
        )}
        {sendState?.status === 'error' && (
          <p className="mb-1 text-xs text-destructive">{sendState.message}</p>
        )}
        <div className="flex gap-2">
          <Textarea
            name="message"
            rows={1}
            required
            maxLength={4000}
            placeholder="Type a message…"
            className="min-h-9 flex-1"
          />
          <Button type="submit">Send</Button>
        </div>
      </form>
    </div>
  )
}
