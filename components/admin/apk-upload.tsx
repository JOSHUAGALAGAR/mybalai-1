'use client'

import { Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'

const CHUNK = 8 * 1024 * 1024
const MAX = 250 * 1024 * 1024
const HEADERS = { 'x-mybalai-admin': '1' }

async function sendChunk(upload: string, offset: number, chunk: Blob) {
  let lastError = 'Upload failed.'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `/api/admin/app/upload?upload=${upload}&offset=${offset}`,
        {
          method: 'POST',
          headers: { ...HEADERS, 'content-type': 'application/octet-stream' },
          body: chunk,
        },
      )
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok) return
      // Not worth retrying: a rejected file, or the session ended.
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(data.error ?? 'Upload rejected.')
      }
      lastError = data.error ?? lastError
    } catch (error) {
      if (error instanceof Error && error.message !== 'Failed to fetch')
        throw error
      lastError = 'The connection dropped.'
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }
  throw new Error(`${lastError} Please try again.`)
}

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

export function ApkUpload() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [version, setVersion] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function start() {
    const file = fileRef.current?.files?.[0]
    setError(null)
    setDone(null)
    if (!file) return setError('Choose the .apk file first.')
    if (!file.name.toLowerCase().endsWith('.apk')) {
      return setError(
        'That is not an .apk file. Build type "apk" (the preview build), not the Play .aab.',
      )
    }
    if (file.size > MAX) return setError('That file is larger than 250 MB.')

    setBusy(true)
    setTotal(file.size)
    setSent(0)
    try {
      const upload = crypto.randomUUID()
      for (let offset = 0; offset < file.size; offset += CHUNK) {
        const chunk = file.slice(offset, Math.min(offset + CHUNK, file.size))
        await sendChunk(upload, offset, chunk)
        setSent(offset + chunk.size)
      }
      const res = await fetch('/api/admin/app/upload/complete', {
        method: 'POST',
        headers: { ...HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify({ upload, totalBytes: file.size, version }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not publish the file.')
      setDone(
        `Published ${mb(file.size)}. The landing page now offers this file.`,
      )
      if (fileRef.current) fileRef.current.value = ''
      setVersion('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  const pct = total ? Math.round((sent / total) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="APK file" htmlFor="apk-file">
          <Input
            id="apk-file"
            ref={fileRef}
            type="file"
            accept=".apk"
            disabled={busy}
          />
        </FormField>
        <FormField
          label="Version (optional)"
          htmlFor="apk-version"
          hint="Shown on the landing page, e.g. 1.0.1"
        >
          <Input
            id="apk-version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            maxLength={40}
            placeholder="1.0.1"
            disabled={busy}
          />
        </FormField>
      </div>

      {busy && (
        <div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Uploading {mb(sent)} of {mb(total)} ({pct}%). Keep this page open.
          </p>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {done && (
        <Alert>
          <AlertDescription>{done}</AlertDescription>
        </Alert>
      )}

      <Button onClick={start} disabled={busy}>
        <Upload />
        {busy ? 'Uploading…' : 'Upload and publish'}
      </Button>
    </div>
  )
}
