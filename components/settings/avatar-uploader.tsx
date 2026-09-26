'use client'

import { Camera, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import {
  prepareAvatarAction,
  registerAvatarAction,
  removeAvatarAction,
} from '@/app/(protected)/settings/actions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  AVATAR_BUCKET,
  MAX_AVATAR_BYTES,
  validateUploadFile,
} from '@/lib/identity/rules'
import { createClient } from '@/lib/supabase/client'

export function AvatarUploader({
  initialUrl,
  initials,
}: {
  initialUrl: string | null
  initials: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setError(null)
    const problem = validateUploadFile(file, MAX_AVATAR_BYTES)
    if (problem) return setError(problem)
    setBusy(true)
    try {
      const prepared = await prepareAvatarAction({
        name: file.name,
        type: file.type,
        size: file.size,
      })
      if (!prepared.ok) return setError(prepared.message)
      const { error: uploadError } = await createClient()
        .storage.from(AVATAR_BUCKET)
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: file.type,
        })
      if (uploadError) return setError(uploadError.message)
      const saved = await registerAvatarAction({ path: prepared.path })
      if (!saved.ok) return setError(saved.message)
      setUrl(saved.avatarUrl)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setError(null)
    setBusy(true)
    try {
      const result = await removeAvatarAction()
      if (!result.ok) return setError(result.message)
      setUrl(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20">
        {url && (
          <AvatarImage
            src={url}
            alt="Your profile photo"
            className="object-cover"
          />
        )}
        <AvatarFallback className="text-xl">{initials}</AvatarFallback>
      </Avatar>
      <div className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Choose a profile photo"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="size-4" aria-hidden />
            {busy ? 'Working…' : url ? 'Change photo' : 'Add photo'}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={remove}
            >
              <Trash2 className="size-4" aria-hidden />
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          JPG, PNG or WebP, up to 3 MB.
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
