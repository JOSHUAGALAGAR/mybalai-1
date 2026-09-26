import { BedDouble } from 'lucide-react'
import Link from 'next/link'

import { PhotoThumb } from '@/components/property/photo-thumb'
import { StatusBadge } from '@/components/property/property-status-badge'
import { Card, CardContent } from '@/components/ui/card'
import type { PropertyRow } from '@/repositories/properties.repository'

export function PropertyCard({
  property,
  statusCode,
  statusLabel,
  typeLabel,
  ownedByViewer,
  roomCount,
  photos = [],
}: {
  property: PropertyRow
  statusCode: string | null
  statusLabel: string | null
  typeLabel: string | null
  ownedByViewer?: boolean
  roomCount?: number
  /** Cover first. The thumbnail opens a viewer for all of them. */
  photos?: string[]
}) {
  return (
    <Card className="h-full transition-colors hover:border-ring/60 hover:bg-muted/40">
      <CardContent className="flex items-start gap-3 p-4">
        {/* The thumbnail is its own button (a viewer), so it sits beside the link, not inside it. */}
        <PhotoThumb
          photos={photos}
          alt={property.property_name}
          className="size-20"
        />
        <Link
          href={`/landlord/properties/${property.property_id}`}
          className="block min-w-0 flex-1"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {property.property_name}
              </h3>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {property.address}
              </p>
            </div>
            <StatusBadge code={statusCode} label={statusLabel} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {roomCount !== undefined && (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <BedDouble className="size-3.5" aria-hidden />
                {roomCount} {roomCount === 1 ? 'room' : 'rooms'}
              </span>
            )}
            <span>#{property.property_id}</span>
            {typeLabel && <span>· {typeLabel}</span>}
            {property.is_verified && (
              <span className="text-emerald-600 dark:text-emerald-400">
                · Verified
              </span>
            )}
            {ownedByViewer && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                Yours
              </span>
            )}
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}
