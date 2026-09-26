import Link from 'next/link'
import { ArrowRight, Building2, MapPin, Rocket } from 'lucide-react'

import { StarRating } from '@/components/discovery/star-rating'
import { Button } from '@/components/ui/button'
import type { FeaturedProperty } from '@/services/featured.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function FeaturedCard({ item }: { item: FeaturedProperty }) {
  return (
    // Details and booking are for signed-in people: the app sends everyone else to sign in first, then here.
    <Link
      href={`/discover/${item.propertyId}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={`${item.name}${item.typeName ? `, ${item.typeName}` : ''}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/50">
            <Building2 className="size-10" aria-hidden />
          </div>
        )}
        {item.boosted && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow">
            <Rocket className="size-3" aria-hidden />
            Featured
          </span>
        )}
        {item.typeName && (
          <span className="absolute top-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
            {item.typeName}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="truncate text-base font-semibold text-foreground">
          {item.name}
        </h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{item.address}</span>
        </p>
        <div className="mt-4 flex items-end justify-between gap-2">
          <p className="text-foreground">
            {item.fromPrice !== null ? (
              <>
                <span className="text-xs text-muted-foreground">from </span>
                <span className="text-lg font-bold">
                  {peso.format(item.fromPrice)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {' '}
                  / {item.fromPeriod}
                </span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                Rate on request
              </span>
            )}
          </p>
          <StarRating value={item.ratingAvg} count={item.ratingCount} />
        </div>
      </div>
    </Link>
  )
}

/** The landing page's shop window: real, active listings — or, while there are none, an invitation to add one. */
export function FeaturedProperties({ items }: { items: FeaturedProperty[] }) {
  return (
    <section
      id="featured"
      aria-labelledby="featured-title"
      className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Featured places</p>
          <h2
            id="featured-title"
            className="mt-2 text-3xl font-semibold tracking-tight text-balance text-foreground"
          >
            Find your next home
          </h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Boarding houses, rooms and bed spaces from verified landlords. Sign
            in to see rooms, photos and rates, and to book.
          </p>
        </div>
        {items.length > 0 && (
          <Button asChild variant="outline">
            <Link href="/discover">
              Browse all places
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        )}
      </div>

      {items.length > 0 ? (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.propertyId}>
              <FeaturedCard item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
          <Building2
            className="mx-auto size-10 text-muted-foreground/60"
            aria-hidden
          />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            Listings are on their way
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            New places are reviewed and added regularly. Own a boarding house?
            List it for free and reach tenants looking right now.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/apply">List your property</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/signup">Create a tenant account</Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
