'use client'

import { ImagePlus, Star, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { serverImageApi } from '@/components/property/image-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { uploadToStorage } from '@/lib/images/browser-upload'
import {
  ALLOWED_IMAGE_TYPES,
  imageLimit,
  MAX_IMAGE_BYTES,
  type ImageTarget,
} from '@/lib/images/rules'
import {
  uploadImages,
  type GalleryImage,
  type ImageApi,
  type UploadFile,
} from '@/lib/images/upload'
import { cn } from '@/lib/utils'

/**
 * Photos of an existing property or room: add several at once, choose the cover, remove.
 * Changes are saved immediately (each action is its own request), no Save button.
 */
export function PhotoManager({
  target,
  initialImages,
  api = serverImageApi,
  uploadFile = uploadToStorage,
  title = 'Photos',
}: {
  target: ImageTarget
  /** `null` when the photo tables are not set up yet (migration 0013 not applied). */
  initialImages: GalleryImage[] | null
  api?: ImageApi
  uploadFile?: UploadFile
  title?: string
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState(initialImages ?? [])
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const max = imageLimit(target)
  const uploading = progress !== null
  const busy = uploading || busyId !== null

  async function add(picked: FileList | null) {
    const files = picked ? Array.from(picked) : []
    if (inputRef.current) inputRef.current.value = ''
    if (files.length === 0) return
    setError(null)
    setProgress({ done: 0, total: files.length })
    const result = await uploadImages({
      target,
      files,
      existingCount: images.length,
      api,
      uploadFile,
      onProgress: (done, total) => setProgress({ done, total }),
    })
    setProgress(null)
    if (result.ok) setImages(result.images)
    else setError(result.message)
  }

  async function change(
    imageId: number,
    call: (t: ImageTarget, id: number) => ReturnType<ImageApi['remove']>,
  ) {
    setError(null)
    setBusyId(imageId)
    const result = await call(target, imageId)
    setBusyId(null)
    if (result.ok) setImages(result.data)
    else setError(result.message)
  }

  if (initialImages === null) {
    return (
      <Alert>
        <AlertDescription>
          Photo uploads are not set up yet. Run migration{' '}
          <code>0013_property_images.sql</code> in the Supabase SQL editor, then
          reload this page.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <section className="space-y-3" aria-labelledby={`${inputId}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id={`${inputId}-title`} className="text-base font-semibold">
            {title}
          </h2>
          <p className="text-muted-foreground text-xs">
            {images.length}/{max} · JPG, PNG or WebP, up to{' '}
            {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB each
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || images.length >= max}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus /> {uploading ? 'Uploading…' : 'Add photos'}
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          className="sr-only"
          aria-label="Choose photos to upload"
          onChange={(e) => void add(e.target.files)}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {progress && (
        <p role="status" className="text-muted-foreground text-sm">
          Uploading {progress.done} of {progress.total}…
        </p>
      )}

      {images.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No photos yet. Add a few — the first one becomes the cover.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
          {images.map((image) => (
            <li
              key={image.imageId}
              className={cn(
                'bg-muted relative aspect-[4/3] overflow-hidden rounded-lg border',
                image.isCover && 'ring-primary ring-2',
                busyId === image.imageId && 'opacity-60',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.originalFilename ?? 'Photo'}
                className="size-full object-cover"
                loading="lazy"
              />
              {image.isCover ? (
                <span className="bg-primary text-primary-foreground absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium">
                  <Star className="size-3" aria-hidden /> Cover
                </span>
              ) : (
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  disabled={busy}
                  className="absolute top-1.5 left-1.5"
                  onClick={() => void change(image.imageId, api.setCover)}
                >
                  Make cover
                </Button>
              )}
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                disabled={busy}
                aria-label={`Remove ${image.originalFilename ?? 'photo'}`}
                className="absolute top-1.5 right-1.5"
                onClick={() => {
                  if (window.confirm('Remove this photo?')) {
                    void change(image.imageId, api.remove)
                  }
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
