'use client'

import { useActionState, useState } from 'react'

import {
  approveAction,
  rejectAction,
  resetPasswordAction,
  type ReviewState,
} from '@/app/(protected)/admin/applications/actions'
import {
  CredentialsDialog,
  type Credentials,
} from '@/components/admin/credentials-dialog'
import { DocumentPreview } from '@/components/admin/document-preview'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import type { ApplicationView } from '@/services/applications.service'

const stamp = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

export function ApplicationList({ items }: { items: ApplicationView[] }) {
  // Hoisted here (not in the card) so the popup survives the list refreshing after an approval.
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing here"
        description="No applications in this list."
      />
    )
  }
  return (
    <>
      <CredentialsDialog
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />
      <ul className="space-y-3">
        {items.map((a) => (
          <li
            key={a.applicationId}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-extrabold text-foreground">
                  {a.propertyName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {a.roomsCount} {a.roomsCount === 1 ? 'room' : 'rooms'} ·{' '}
                  {a.address}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">{a.reference}</p>
                <p>{stamp.format(new Date(a.createdAt))}</p>
              </div>
            </div>

            <dl className="mt-3 grid gap-x-6 gap-y-1 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Applicant</dt>
                <dd className="font-medium">{a.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="font-medium break-all">{a.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd className="font-medium">{a.phone}</dd>
              </div>
              {a.businessName && (
                <div>
                  <dt className="text-xs text-muted-foreground">Business</dt>
                  <dd className="font-medium">{a.businessName}</dd>
                </div>
              )}
            </dl>
            <Documents
              id={a.applicationId}
              title={`${a.propertyName} — ${a.fullName}`}
              documents={a.documents}
            />
            {a.description && (
              <p className="mt-3 text-sm whitespace-pre-wrap text-foreground">
                {a.description}
              </p>
            )}

            {a.status === 'pending' && (
              <Review
                id={a.applicationId}
                email={a.email}
                onCredentials={setCredentials}
              />
            )}
            {a.status === 'approved' && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="flex items-center gap-2 text-sm">
                  <Badge>Approved</Badge>
                  <span className="text-muted-foreground">
                    {a.reviewedAt ? stamp.format(new Date(a.reviewedAt)) : ''} —
                    landlord account created.
                  </span>
                </p>
                <NewPassword
                  id={a.applicationId}
                  onCredentials={setCredentials}
                />
              </div>
            )}
            {a.status === 'rejected' && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="destructive">Rejected</Badge>
                <span className="text-muted-foreground">{a.rejectReason}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function Review({
  id,
  email,
  onCredentials,
}: {
  id: number
  email: string
  onCredentials: (c: Credentials) => void
}) {
  const [mode, setMode] = useState<'reject' | null>(null)
  const [approved, approve, approving] = useActionState<ReviewState, FormData>(
    async (prev, formData) => {
      const result = await approveAction(prev, formData)
      if (result?.status === 'approved') {
        onCredentials({
          email: result.email,
          password: result.password,
          reason: 'created',
        })
      }
      return result
    },
    undefined,
  )
  const [rejected, reject, rejecting] = useActionState<ReviewState, FormData>(
    rejectAction,
    undefined,
  )

  if (approved?.status === 'approved') {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Approved — the sign-in details are in the window on screen.
      </p>
    )
  }
  if (rejected?.status === 'rejected') {
    return <p className="mt-3 text-sm text-muted-foreground">Rejected.</p>
  }
  const error =
    approved?.status === 'error'
      ? approved.message
      : rejected?.status === 'error'
        ? (rejected.fieldErrors?.reason?.[0] ?? rejected.message)
        : null

  return (
    <div className="mt-3 space-y-2">
      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          <form action={approve}>
            <input type="hidden" name="application_id" value={id} />
            <Button
              type="submit"
              size="sm"
              disabled={approving}
              aria-busy={approving}
            >
              {approving
                ? 'Creating account…'
                : `Approve and create account for ${email}`}
            </Button>
          </form>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMode('reject')}
          >
            Reject
          </Button>
        </div>
      ) : (
        <form
          action={reject}
          className="flex flex-wrap items-end gap-2"
          noValidate
        >
          <input type="hidden" name="application_id" value={id} />
          <label className="min-w-64 flex-1 text-xs font-semibold text-muted-foreground">
            Why? (kept on record)
            <Input
              name="reason"
              placeholder="e.g. We could not verify the address"
              className="mt-1 h-10"
            />
          </label>
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={rejecting}
          >
            {rejecting ? 'Saving…' : 'Confirm reject'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setMode(null)}
            disabled={rejecting}
          >
            Cancel
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** What was attached (names only); the files themselves open on demand, each look logged. */
function Documents({
  id,
  title,
  documents,
}: {
  id: number
  title: string
  documents: ApplicationView['documents']
}) {
  if (documents.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No documents attached.
      </p>
    )
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          Documents ({documents.length})
        </p>
        {documents.map((d, i) => (
          <Badge key={i} variant="secondary">
            {d.label}
          </Badge>
        ))}
      </div>
      <DocumentPreview
        applicationId={id}
        title={title}
        count={documents.length}
      />
    </div>
  )
}

/** The password is never stored: if it was lost, issue a fresh one (the old one stops working). */
function NewPassword({
  id,
  onCredentials,
}: {
  id: number
  onCredentials: (c: Credentials) => void
}) {
  const [asking, setAsking] = useState(false)
  const [state, action, pending] = useActionState<ReviewState, FormData>(
    async (prev, formData) => {
      const result = await resetPasswordAction(prev, formData)
      if (result?.status === 'approved') {
        setAsking(false)
        onCredentials({
          email: result.email,
          password: result.password,
          reason: 'reset',
        })
      }
      return result
    },
    undefined,
  )

  if (!asking) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setAsking(true)}
      >
        Lost the password? Issue a new one
      </Button>
    )
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="application_id" value={id} />
      <span className="text-muted-foreground">
        The current password will stop working.
      </span>
      <Button
        type="submit"
        size="sm"
        variant="destructive"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? 'Issuing…' : 'Issue new password'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setAsking(false)}
        disabled={pending}
      >
        Cancel
      </Button>
      {state?.status === 'error' && (
        <span role="alert" className="w-full text-destructive">
          {state.message}
        </span>
      )}
    </form>
  )
}
