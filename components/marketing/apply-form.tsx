'use client'

import { CheckCircle2, FileText, Upload } from 'lucide-react'
import Link from 'next/link'
import { startTransition, useActionState, useId, useRef, useState } from 'react'

import {
  prepareUploadsAction,
  submitApplicationAction,
  type ApplyState,
} from '@/app/apply/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import {
  APPLICATION_BUCKET,
  DOC_TYPES,
  MAX_DOCS_TOTAL,
  guessDocType,
  validateDocFile,
  type DocTypeCode,
} from '@/lib/applications/documents'
import { createClient } from '@/lib/supabase/client'

/** A file the applicant chose. `type` is guessed from its name (an unrecognised name is "other"); staff read them all. */
type Picked = { id: number; file: File; type: DocTypeCode }
type Uploaded = {
  batchId: string
  signature: string
  docs: {
    type: string
    path: string
    name: string
    mime: string
    size: number
  }[]
}

const signatureOf = (picked: Picked[]) =>
  picked
    .map(
      (p) => `${p.type}:${p.file.name}:${p.file.size}:${p.file.lastModified}`,
    )
    .join('|')

const kb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

export function ApplyForm() {
  const [state, action, submitting] = useActionState<ApplyState, FormData>(
    submitApplicationAction,
    undefined,
  )
  const [picked, setPicked] = useState<Picked[]>([])
  const [docError, setDocError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const nextId = useRef(1)
  const inputId = useId()
  // Files already sent to storage: a retry after a form mistake must not upload them again.
  const uploaded = useRef<Uploaded | null>(null)
  const busy = uploading || submitting

  /** One upload box for everything: any number of files at once, added to whatever is already there. */
  const pickFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    setDocError(null)
    const next = [...picked]
    const problems: string[] = []
    for (const file of Array.from(files)) {
      const problem = validateDocFile(file)
      if (problem) problems.push(problem)
      else if (next.length >= MAX_DOCS_TOTAL)
        problems.push(`You can attach up to ${MAX_DOCS_TOTAL} files.`)
      else
        next.push({
          id: nextId.current++,
          file,
          type: guessDocType(file.name) ?? 'other',
        })
    }
    setPicked(next)
    if (problems.length > 0) setDocError([...new Set(problems)].join(' '))
  }
  const drop = (id: number) => {
    setDocError(null)
    setPicked((cur) => cur.filter((p) => p.id !== id))
  }

  /** Only a hint of what we noticed — the team reads every file whatever it is called. */
  const noticed = new Set(picked.map((p) => p.type))

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setDocError(null)
    if (picked.length === 0) {
      setDocError('Please attach your documents first.')
      document
        .getElementById('documents')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setUploading(true)
    try {
      const signature = signatureOf(picked)
      if (uploaded.current?.signature !== signature) {
        const website = String(new FormData(form).get('website') ?? '')
        const prepared = await prepareUploadsAction({
          website,
          docs: picked.map((p) => ({
            type: p.type,
            name: p.file.name,
            mime: p.file.type,
            size: p.file.size,
          })),
        })
        if (!prepared.ok) return setDocError(prepared.message)
        const storage = createClient().storage.from(APPLICATION_BUCKET)
        for (const u of prepared.uploads) {
          const file = picked[u.index].file
          const { error } = await storage.uploadToSignedUrl(
            u.path,
            u.token,
            file,
            { contentType: file.type },
          )
          if (error)
            return setDocError(
              `Could not upload “${file.name}”: ${error.message}`,
            )
        }
        uploaded.current = {
          batchId: prepared.batchId,
          signature,
          docs: prepared.uploads.map((u) => ({
            type: picked[u.index].type,
            path: u.path,
            name: picked[u.index].file.name,
            mime: picked[u.index].file.type,
            size: picked[u.index].file.size,
          })),
        }
      }
      const data = new FormData(form)
      data.set('batch_id', uploaded.current.batchId)
      data.set('documents', JSON.stringify(uploaded.current.docs))
      startTransition(() => action(data))
    } finally {
      setUploading(false)
    }
  }

  if (state?.status === 'success') {
    return (
      <div className="space-y-4 py-4 text-center">
        <CheckCircle2 className="mx-auto size-12 text-primary" aria-hidden />
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          Application received
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Thank you! Our team will review your property and contact you by email
          or phone. If approved, we create your landlord account and send you
          your sign-in details.
        </p>
        <p className="text-sm">
          Your reference:{' '}
          <span className="font-bold text-foreground">{state.reference}</span>
        </p>
        <Button asChild>
          <Link href="/">Back to MyBalai</Link>
        </Button>
      </div>
    )
  }

  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const v = state?.status === 'error' ? (state.values ?? {}) : {}

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          List your property
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Listing on MyBalai is free. Tell us about you and your property; our
          team reviews every application and sets up your landlord account.
        </p>
      </div>

      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div
        aria-hidden
        className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
      >
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-foreground">About you</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Full name"
            htmlFor="full_name"
            required
            error={errs.full_name}
          >
            <Input
              id="full_name"
              name="full_name"
              autoComplete="name"
              maxLength={120}
              defaultValue={v.full_name ?? ''}
            />
          </FormField>
          <FormField
            label="Business name"
            htmlFor="business_name"
            error={errs.business_name}
            hint="Optional."
          >
            <Input
              id="business_name"
              name="business_name"
              maxLength={160}
              defaultValue={v.business_name ?? ''}
            />
          </FormField>
          <FormField label="Email" htmlFor="email" required error={errs.email}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={200}
              defaultValue={v.email ?? ''}
            />
          </FormField>
          <FormField
            label="Phone"
            htmlFor="phone"
            required
            error={errs.phone}
            hint="Philippine mobile, e.g. 0917 123 4567."
          >
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
              defaultValue={v.phone ?? ''}
            />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-foreground">
          Your property
        </legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <FormField
            label="Property name"
            htmlFor="property_name"
            required
            error={errs.property_name}
          >
            <Input
              id="property_name"
              name="property_name"
              maxLength={200}
              defaultValue={v.property_name ?? ''}
            />
          </FormField>
          <FormField
            label="Number of rooms"
            htmlFor="rooms_count"
            required
            error={errs.rooms_count}
          >
            <Input
              id="rooms_count"
              name="rooms_count"
              inputMode="numeric"
              defaultValue={v.rooms_count ?? ''}
            />
          </FormField>
        </div>
        <FormField
          label="Address"
          htmlFor="address"
          required
          error={errs.address}
          hint="Street, barangay, city."
        >
          <Input
            id="address"
            name="address"
            autoComplete="street-address"
            maxLength={300}
            defaultValue={v.address ?? ''}
          />
        </FormField>
        <FormField
          label="Anything else we should know?"
          htmlFor="description"
          error={errs.description}
          hint="Optional — room types, rates, how long you have rented out, and so on."
        >
          <Textarea
            id="description"
            name="description"
            rows={4}
            maxLength={2000}
            defaultValue={v.description ?? ''}
          />
        </FormField>
      </fieldset>

      <fieldset id="documents" className="space-y-3">
        <legend className="text-sm font-bold text-foreground">
          Business documents
        </legend>
        <p className="text-xs text-muted-foreground">
          We verify every property before it is listed. Only MyBalai staff can
          see your files.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!busy) pickFiles(e.dataTransfer.files)
          }}
          className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging
              ? 'border-primary bg-primary-soft'
              : 'border-border bg-muted/30'
          }`}
        >
          <Upload className="mx-auto size-8 text-primary" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-foreground">
            Upload all your documents here
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Select as many files as you need in one go — PDF or clear photos, up
            to 5 MB each.
          </p>
          <label
            htmlFor={inputId}
            className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Choose files
          </label>
          <input
            id={inputId}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose your documents"
            disabled={busy}
            onChange={(e) => {
              pickFiles(e.target.files)
              e.target.value = ''
            }}
          />

          <div className="mx-auto mt-4 max-w-lg text-left">
            <p className="text-xs font-semibold text-muted-foreground">
              Please include
            </p>
            <ul
              className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2"
              aria-label="Documents to include"
            >
              {DOC_TYPES.filter((t) => t.required).map((t) => (
                <li
                  key={t.code}
                  className={
                    noticed.has(t.code)
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }
                >
                  <span aria-hidden>{noticed.has(t.code) ? '✓' : '•'}</span>{' '}
                  {t.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              If you have them, also: BIR registration (2303), Fire Safety
              Inspection Certificate, Sanitary permit.
            </p>
          </div>
        </div>

        {picked.length > 0 && (
          <ul
            className="divide-y divide-border rounded-2xl border border-border"
            aria-label="Your files"
          >
            {picked.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <FileText
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {p.file.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {kb(p.file.size)}
                </span>
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline hover:text-foreground"
                  onClick={() => drop(p.id)}
                  disabled={busy}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {(docError || errs.documents) && (
          <p role="alert" className="text-sm text-destructive">
            {docError ?? errs.documents?.[0]}
          </p>
        )}
      </fieldset>

      <SubmitButton
        pendingText={uploading ? 'Uploading documents…' : 'Sending…'}
        className="w-full sm:w-auto"
        pending={uploading || submitting}
      >
        Submit application
      </SubmitButton>
    </form>
  )
}
