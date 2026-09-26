'use client'

import { ChevronLeft, ChevronRight, ImageOff, Images } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * A small cover photo (with a "+N" count) that opens a full-size viewer for all the photos of
 * one room or property: arrows / arrow keys to move, thumbnails to jump.
 */
export function PhotoThumb({
  photos,
  alt,
  className,
}: {
  photos: string[]
  /** e.g. the room's name — used for the button and the image descriptions. */
  alt: string
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)

  if (photos.length === 0) {
    return (
      <span
        role="img"
        aria-label={`${alt} has no photos yet`}
        className={cn(
          'flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground',
          className,
        )}
      >
        <ImageOff className="size-5" aria-hidden />
      </span>
    )
  }

  const current = Math.min(index, photos.length - 1)
  const step = (by: number) =>
    setIndex((current + by + photos.length) % photos.length)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setIndex(0)
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`View ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} of ${alt}`}
          className={cn(
            'group relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted ring-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-primary',
            className,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[0]}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
          {photos.length > 1 && (
            <span className="absolute right-1 bottom-1 inline-flex items-center gap-0.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">
              <Images className="size-2.5" aria-hidden />
              {photos.length}
            </span>
          )}
        </button>
      </DialogTrigger>

      <DialogContent
        className="max-w-4xl bg-black text-white"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') step(-1)
          if (e.key === 'ArrowRight') step(1)
        }}
      >
        <DialogTitle className="sr-only">{alt} photos</DialogTitle>
        <DialogDescription className="sr-only">
          Photo {current + 1} of {photos.length}. Use the arrow keys to see the
          others.
        </DialogDescription>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[current]}
            alt={`${alt} — photo ${current + 1} of ${photos.length}`}
            className="max-h-[72dvh] w-full object-contain"
          />
          {photos.length > 1 && (
            <>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Previous photo"
                className="absolute top-1/2 left-3 -translate-y-1/2"
                onClick={() => step(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Next photo"
                className="absolute top-1/2 right-3 -translate-y-1/2"
                onClick={() => step(1)}
              >
                <ChevronRight />
              </Button>
              <span className="absolute bottom-3 left-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold">
                {current + 1} / {photos.length}
              </span>
            </>
          )}
        </div>

        {photos.length > 1 && (
          <ul className="flex gap-2 overflow-x-auto bg-black p-3">
            {photos.map((url, i) => (
              <li key={url} className="shrink-0">
                <button
                  type="button"
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === current}
                  onClick={() => setIndex(i)}
                  className={cn(
                    'block h-14 w-20 overflow-hidden rounded-lg border-2 transition-opacity',
                    i === current
                      ? 'border-primary'
                      : 'border-transparent opacity-60 hover:opacity-100',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
