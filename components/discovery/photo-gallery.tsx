'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Cover photo large, the rest as thumbnails. Keyboard and screen-reader friendly. */
export function PhotoGallery({
  photos,
  alt,
}: {
  photos: string[]
  alt: string
}) {
  const [index, setIndex] = useState(0)
  if (photos.length === 0) return null

  const current = Math.min(index, photos.length - 1)
  const step = (by: number) =>
    setIndex((current + by + photos.length) % photos.length)

  return (
    <div
      className="space-y-2"
      aria-roledescription="carousel"
      aria-label={`${alt} photos`}
    >
      <div className="bg-muted relative aspect-[16/8] overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[current]}
          alt={`${alt} — photo ${current + 1} of ${photos.length}`}
          className="size-full object-cover"
        />
        {photos.length > 1 && (
          <>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label="Previous photo"
              className="absolute top-1/2 left-2 -translate-y-1/2"
              onClick={() => step(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label="Next photo"
              className="absolute top-1/2 right-2 -translate-y-1/2"
              onClick={() => step(1)}
            >
              <ChevronRight />
            </Button>
            <span className="bg-background/80 absolute right-2 bottom-2 rounded-md px-2 py-0.5 text-xs">
              {current + 1} / {photos.length}
            </span>
          </>
        )}
      </div>

      {photos.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <li key={url} className="shrink-0">
              <button
                type="button"
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === current}
                onClick={() => setIndex(i)}
                className={cn(
                  'bg-muted block h-14 w-20 overflow-hidden rounded-md border-2 transition-opacity',
                  i === current
                    ? 'border-primary'
                    : 'border-transparent opacity-70 hover:opacity-100',
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
    </div>
  )
}
