'use client'

import { ImagePlus, Star, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  validateImageFile,
} from '@/lib/images/rules'
import { cn } from '@/lib/utils'

/**
 * Photo chooser for the Add forms. Files stay in the browser until the form is saved (the
 * property/room has to exist first), so this is a controlled component: the form owns
 * `files` and which one is the cover.
 */
export function ImagePicker({
  files,
  coverIndex,
  onChange,
  max,
  disabled,
  label = 'Photos',
}: {
  files: File[]
  coverIndex: number
  onChange: (files: File[], coverIndex: number) => void
  max: number
  disabled?: boolean
  label?: string
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState<string | null>(null)

  // One preview URL per file, released when the file leaves the list or the form closes.
  const previews = useMemo(
    () => files.map((f) => URL.createObjectURL(f)),
    [files],
  )
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  )

  function add(picked: FileList | null) {
    if (!picked || picked.length === 0) return
    const next = [...files]
    let problem: string | null = null
    for (const file of Array.from(picked)) {
      const invalid = validateImageFile(file)
      if (invalid) problem = invalid
      else if (next.length >= max) problem = `You can add up to ${max} photos.`
      else next.push(file)
    }
    setNote(problem)
    onChange(next, files.length === 0 ? 0 : coverIndex)
    if (inputRef.current) inputRef.current.value = ''
  }

  function remove(index: number) {
    setNote(null)
    const next = files.filter((_, i) => i !== index)
    // Keep the cover on the same photo; if it was removed, the first one takes over.
    const cover =
      index === coverIndex
        ? 0
        : index < coverIndex
          ? coverIndex - 1
          : coverIndex
    onChange(next, next.length === 0 ? 0 : cover)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-muted-foreground text-xs">
          {files.length}/{max}
        </span>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
        {files.map((file, i) => (
          <li
            key={`${file.name}-${file.size}-${i}`}
            className={cn(
              'group bg-muted relative aspect-[4/3] overflow-hidden rounded-lg border',
              i === coverIndex && 'ring-primary ring-2',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previews[i]}
              alt={file.name}
              className="size-full object-cover"
            />
            {i === coverIndex ? (
              <span className="bg-primary text-primary-foreground absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium">
                <Star className="size-3" aria-hidden /> Cover
              </span>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={disabled}
                className="absolute top-1.5 left-1.5"
                onClick={() => onChange(files, i)}
              >
                Make cover
              </Button>
            )}
            <Button
              type="button"
              size="icon-xs"
              variant="secondary"
              disabled={disabled}
              aria-label={`Remove ${file.name}`}
              className="absolute top-1.5 right-1.5"
              onClick={() => remove(i)}
            >
              <X />
            </Button>
          </li>
        ))}

        {files.length < max && (
          <li>
            <label
              htmlFor={inputId}
              className={cn(
                'text-muted-foreground hover:bg-muted/60 flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-2 text-center text-sm transition-colors',
                disabled && 'pointer-events-none opacity-50',
              )}
            >
              <ImagePlus className="size-5" aria-hidden />
              <span>{files.length === 0 ? 'Add photos' : 'Add more'}</span>
            </label>
          </li>
        )}
      </ul>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => add(e.target.files)}
      />

      <p className="text-muted-foreground text-xs">
        JPG, PNG or WebP, up to {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB
        each. The first photo is the cover unless you choose another.
      </p>
      {note && (
        <p role="alert" className="text-destructive text-xs">
          {note}
        </p>
      )}
    </div>
  )
}
