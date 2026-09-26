import Link from 'next/link'
import { MapPin, Rocket } from 'lucide-react'

import { StarRating } from '@/components/discovery/star-rating'
import { Card, CardContent } from '@/components/ui/card'
import type { DiscoveryCard } from '@/services/discovery.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function PropertyResultCard({ item }: { item: DiscoveryCard }) {
  return (
    <Link href={`/discover/${item.propertyId}`} className="block">
      <Card className="h-full overflow-hidden transition-colors hover:border-ring/60">
        <div className="relative aspect-[16/10] bg-muted">
          {item.boosted && (
            <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow">
              <Rocket className="size-3" aria-hidden />
              Boosted
            </span>
          )}
          {item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )}
        </div>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {item.name}
            </h3>
            {item.typeName && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {item.typeName}
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{item.address}</span>
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {item.fromPrice !== null ? (
                <>
                  from {peso.format(item.fromPrice)}
                  <span className="text-xs font-normal text-muted-foreground">
                    {' '}
                    / {item.fromPeriod}
                  </span>
                </>
              ) : (
                <span className="text-xs font-normal text-muted-foreground">
                  Rate on request
                </span>
              )}
            </span>
            <StarRating value={item.ratingAvg} count={item.ratingCount} />
          </div>
          {item.amenityCount > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {item.amenityCount} amenit{item.amenityCount === 1 ? 'y' : 'ies'}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
