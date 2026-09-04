'use client'

import { useActionState } from 'react'

import {
  addNoteAction,
  addReplyAction,
  type PaymentActionState,
} from '@/app/(protected)/payments/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import type { PaymentDetail } from '@/services/payments.service'

type Entry = {
  key: string
  author: string | null
  role: string
  body: string
  at: string
  kind: 'note' | 'reply'
}

export function PaymentNotes({
  paymentId,
  notes,
  replies,
}: {
  paymentId: number
  notes: PaymentDetail['notes']
  replies: PaymentDetail['replies']
}) {
  const [noteState, noteAction] = useActionState<PaymentActionState, FormData>(
    addNoteAction,
    undefined,
  )
  const [replyState, replyAction] = useActionState<
    PaymentActionState,
    FormData
  >(addReplyAction, undefined)

  const entries: Entry[] = [
    ...notes.map((n) => ({
      key: `n${n.id}`,
      author: n.author,
      role: n.role,
      body: n.note,
      at: n.at,
      kind: 'note' as const,
    })),
    ...replies.map((r) => ({
      key: `r${r.id}`,
      author: r.author,
      role: r.role,
      body: r.reply,
      at: r.at,
      kind: 'reply' as const,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li
              key={e.key}
              className={
                e.kind === 'reply' ? 'ml-6 border-l-2 border-border pl-3' : ''
              }
            >
              <p className="text-xs text-muted-foreground">
                {e.author ?? 'Someone'}{' '}
                <span className="capitalize">({e.role})</span> ·{' '}
                {new Date(e.at).toLocaleString()}
              </p>
              <p className="text-sm whitespace-pre-wrap text-foreground">
                {e.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {(noteState?.status === 'success' ||
        replyState?.status === 'success') && (
        <Alert>
          <AlertDescription>
            {noteState?.status === 'success'
              ? noteState.message
              : replyState?.status === 'success'
                ? replyState.message
                : ''}
          </AlertDescription>
        </Alert>
      )}

      <form action={noteAction} className="space-y-2">
        <input type="hidden" name="payment_id" value={paymentId} />
        {noteState?.status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{noteState.message}</AlertDescription>
          </Alert>
        )}
        <Textarea
          name="note"
          rows={2}
          maxLength={2000}
          placeholder="Add a note…"
          required
        />
        <SubmitButton pendingText="Adding…" variant="secondary">
          Add note
        </SubmitButton>
      </form>

      <form action={replyAction} className="space-y-2">
        <input type="hidden" name="payment_id" value={paymentId} />
        {replyState?.status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{replyState.message}</AlertDescription>
          </Alert>
        )}
        <Textarea
          name="reply"
          rows={2}
          maxLength={2000}
          placeholder="Reply to the thread…"
          required
        />
        <SubmitButton pendingText="Replying…" variant="outline">
          Reply
        </SubmitButton>
      </form>
    </div>
  )
}
