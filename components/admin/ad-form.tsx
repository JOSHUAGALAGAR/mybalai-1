'use client'

import { ImagePlus, X } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'

import {
  prepareAdImageAction,
  type AdActionState,
} from '@/app/(protected)/admin/ads/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import { AD_BUCKET, AD_ROLES, MAX_AD_IMAGE_BYTES } from '@/lib/ads/rules'
import { validateUploadFile } from '@/lib/identity/rules'
import { createClient } from '@/lib/supabase/client'

type Values = Record<string, string | string[]>

const str = (v: string | string[] | undefined) =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '')

export function AdForm({
  action,
  adId,
  initial = {},
  initialImageUrl = null,
  submitLabel,
}: {
  action: (state: AdActionState, fd: FormData) => Promise<AdActionState>
  adId?: number
  initial?: Values
  initialImageUrl?: string | null
  submitLabel: string
}) {
  const [state, formAction] = useActionState<AdActionState, FormData>(
    action,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  // After a failed save show exactly what was submitted (an unticked box is simply absent).
  const failed = state?.status === 'error'
  const v: Values = failed ? (state.values ?? {}) : initial
  const submittedRoles = Array.isArray(v.target_roles)
    ? v.target_roles
    : v.target_roles
      ? [v.target_roles]
      : []
  const roles =
    failed || 'target_roles' in initial
      ? submittedRoles
      : AD_ROLES.map((r) => r.code)

  const fileRef = useRef<HTMLInputElement>(null)
  const [imagePath, setImagePath] = useState(str(v.image_path))
  const [preview, setPreview] = useState<string | null>(initialImageUrl)
  const [removeImage, setRemoveImage] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setUploadError(null)
    const problem = validateUploadFile(file, MAX_AD_IMAGE_BYTES)
    if (problem) return setUploadError(problem)
    setUploading(true)
    try {
      const prepared = await prepareAdImageAction({
        name: file.name,
        type: file.type,
        size: file.size,
      })
      if (!prepared.ok) return setUploadError(prepared.message)
      const { error } = await createClient()
        .storage.from(AD_BUCKET)
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: file.type,
          cacheControl: '31536000',
        })
      if (error) return setUploadError(error.message)
      setImagePath(prepared.path)
      setPreview(URL.createObjectURL(file))
      setRemoveImage(false)
    } finally {
      setUploading(false)
    }
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-5" noValidate>
      {adId !== undefined && <input type="hidden" name="ad_id" value={adId} />}
      <input type="hidden" name="image_path" value={imagePath} />
      {removeImage && <input type="hidden" name="remove_image" value="true" />}

      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <FormField label="Title" htmlFor="title" required error={errs.title}>
        <Input
          id="title"
          name="title"
          required
          maxLength={120}
          defaultValue={str(v.title)}
        />
      </FormField>

      <FormField
        label="Text"
        htmlFor="body"
        error={errs.body}
        hint="Optional. A sentence or two."
      >
        <Textarea
          id="body"
          name="body"
          rows={3}
          maxLength={500}
          defaultValue={str(v.body)}
        />
      </FormField>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Picture</p>
        <div className="flex items-center gap-4">
          {preview && !removeImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Ad preview"
              className="h-24 w-40 rounded-xl border border-border object-cover"
            />
          ) : (
            <div className="flex h-24 w-40 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
              No picture
            </div>
          )}
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              id="ad-image"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="size-4" aria-hidden />
              {uploading
                ? 'Uploading…'
                : preview && !removeImage
                  ? 'Replace'
                  : 'Add picture'}
            </Button>
            {preview && !removeImage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPreview(null)
                  setImagePath('')
                  setRemoveImage(true)
                }}
              >
                <X className="size-4" aria-hidden /> Remove
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          JPG, PNG or WebP, up to 3 MB. Wide pictures (about 3:1) look best.
        </p>
        {uploadError && (
          <p className="text-xs text-destructive">{uploadError}</p>
        )}
        {errs.image_path?.map((m) => (
          <p key={m} className="text-xs text-destructive">
            {m}
          </p>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Link"
          htmlFor="link_url"
          error={errs.link_url}
          hint="Optional. Where the button goes."
        >
          <Input
            id="link_url"
            name="link_url"
            type="url"
            placeholder="https://…"
            defaultValue={str(v.link_url)}
          />
        </FormField>
        <FormField
          label="Button text"
          htmlFor="link_label"
          error={errs.link_label}
        >
          <Input
            id="link_label"
            name="link_label"
            maxLength={40}
            placeholder="Learn more"
            defaultValue={str(v.link_label)}
          />
        </FormField>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Show to<span className="ml-0.5 text-destructive">*</span>
        </legend>
        <div className="flex flex-wrap gap-4">
          {AD_ROLES.map((r) => (
            <label key={r.code} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="target_roles"
                value={r.code}
                defaultChecked={roles.includes(r.code)}
                className="size-4 accent-primary"
              />
              {r.label}
            </label>
          ))}
        </div>
        {errs.target_roles?.map((m) => (
          <p key={m} className="text-xs text-destructive">
            {m}
          </p>
        ))}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Starts on"
          htmlFor="starts_on"
          error={errs.starts_on}
          hint="Empty = right away."
        >
          <Input
            id="starts_on"
            name="starts_on"
            type="date"
            defaultValue={str(v.starts_on)}
          />
        </FormField>
        <FormField
          label="Ends on"
          htmlFor="ends_on"
          error={errs.ends_on}
          hint="Empty = until you stop it."
        >
          <Input
            id="ends_on"
            name="ends_on"
            type="date"
            defaultValue={str(v.ends_on)}
          />
        </FormField>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={str(v.is_active) !== ''}
          value="true"
          className="size-4 accent-primary"
        />
        Active (untick to keep it as a draft)
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
        <Button asChild variant="ghost">
          <Link href="/admin/ads">Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
