'use client'

import { BadgeCheck, Clock, ShieldAlert } from 'lucide-react'
import { useState } from 'react'

import {
  prepareIdAction,
  submitIdAction,
} from '@/app/(protected)/settings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { nativeControlClass } from '@/components/ui/form-field'
import { Label } from '@/components/ui/label'
import {
  ID_BUCKET,
  ID_TYPES,
  MAX_ID_BYTES,
  validateUploadFile,
} from '@/lib/identity/rules'
import { createClient } from '@/lib/supabase/client'
import type { MyVerification } from '@/services/verification.service'

export function IdVerificationCard({ initial }: { initial: MyVerification }) {
  const [status, setStatus] = useState(initial)
  const [idType, setIdType] = useState<string>(ID_TYPES[0].code)
  const [front, setFront] = useState<File | null>(null)
  const [back, setBack] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resubmit, setResubmit] = useState(false)

  const showForm =
    status.status === 'none' || (status.status === 'rejected' && resubmit)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!front || !back)
      return setError('Add both the front and the back of your ID.')
    for (const [side, file] of [
      ['front', front],
      ['back', back],
    ] as const) {
      const problem = validateUploadFile(file, MAX_ID_BYTES)
      if (problem) return setError(`The ${side} photo: ${problem}`)
    }
    setBusy(true)
    try {
      const info = (f: File) => ({ name: f.name, type: f.type, size: f.size })
      const prepared = await prepareIdAction({
        idType,
        front: info(front),
        back: info(back),
      })
      if (!prepared.ok) return setError(prepared.message)
      const storage = createClient().storage.from(ID_BUCKET)
      for (const [target, file] of [
        [prepared.front, front],
        [prepared.back, back],
      ] as const) {
        const { error: uploadError } = await storage.uploadToSignedUrl(
          target.path,
          target.token,
          file,
          {
            contentType: file.type,
          },
        )
        if (uploadError) return setError(uploadError.message)
      }
      const done = await submitIdAction({
        idType,
        frontPath: prepared.front.path,
        backPath: prepared.back.path,
      })
      if (!done.ok) return setError(done.message)
      const { ok: _ok, ...verification } = done
      void _ok
      setStatus(verification as MyVerification)
      setFront(null)
      setBack(null)
      setResubmit(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg space-y-4 rounded-2xl border border-border bg-card p-4">
      {status.status === 'approved' && (
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BadgeCheck className="size-5 text-primary" aria-hidden />
          Your ID is verified. Landlords see a Verified badge on your booking
          requests.
        </p>
      )}
      {status.status === 'pending' && (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Clock className="size-5 text-muted-foreground" aria-hidden />
          Your {status.idTypeLabel ?? 'ID'} is waiting for review. This usually
          takes a day or two.
        </p>
      )}
      {status.status === 'rejected' && (
        <div className="space-y-3">
          <Alert variant="destructive">
            <ShieldAlert className="size-4" aria-hidden />
            <AlertDescription>
              Your ID could not be verified
              {status.rejectReason ? `: ${status.rejectReason}` : '.'}
            </AlertDescription>
          </Alert>
          {!resubmit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setResubmit(true)}
            >
              Upload a new ID
            </Button>
          )}
        </div>
      )}
      {status.status === 'none' && (
        <p className="text-sm text-muted-foreground">
          Verify your identity to earn a Verified badge. Upload the front and
          back of a government-issued ID. Only MyBalai staff can see it, and
          only to review it.
        </p>
      )}

      {showForm && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="id-type">Type of ID</Label>
            <select
              id="id-type"
              value={idType}
              onChange={(e) => setIdType(e.target.value)}
              className={nativeControlClass}
            >
              {ID_TYPES.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {(
            [
              ['Front of ID', setFront, front],
              ['Back of ID', setBack, back],
            ] as const
          ).map(([label, set, file]) => (
            <div key={label} className="space-y-1.5">
              <Label htmlFor={`id-${label}`}>{label}</Label>
              <input
                id={`id-${label}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => set(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary-soft file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary"
              />
              {file && (
                <p className="text-xs text-muted-foreground">{file.name}</p>
              )}
            </div>
          ))}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy} aria-busy={busy}>
            {busy ? 'Uploading…' : 'Submit for review'}
          </Button>
        </form>
      )}
    </div>
  )
}
