import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin } from 'lucide-react'

import { StarRating } from '@/components/discovery/star-rating'
import { advanceDepositLabel } from '@/schemas/booking'
import { PhotoGallery } from '@/components/discovery/photo-gallery'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getCurrentUser } from '@/lib/auth/dal'
import { ServiceError } from '@/services/errors'
import { getDiscoveryDetail } from '@/services/discovery.service'

export const metadata: Metadata = { title: 'Property' }

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export default async function DiscoverDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const propertyId = Number((await params).propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound()

  let detail
  try {
    detail = await getDiscoveryDetail(propertyId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  const user = await getCurrentUser()
  const canBook = user?.roles.includes('tenant') ?? false

  const {
    property,
    typeName,
    amenityGroups,
    rooms,
    photos,
    ratings,
    mapUrl,
    fromPrice,
  } = detail

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/discover"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to search
        </Link>
      </div>

      <PhotoGallery photos={photos} alt={property.property_name} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {property.property_name}
            </h1>
            {typeName && <Badge variant="secondary">{typeName}</Badge>}
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            {property.address}
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 underline"
              >
                View on map
              </a>
            )}
          </p>
          <div className="mt-2">
            <StarRating value={ratings.avg} count={ratings.count} size="md" />
          </div>
        </div>
        <div className="text-right">
          {fromPrice.fromPrice !== null && (
            <p className="text-lg font-semibold text-foreground">
              from {peso.format(fromPrice.fromPrice)}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {fromPrice.fromPeriod}
              </span>
            </p>
          )}
          {canBook ? (
            <div className="mt-2 flex flex-col items-end gap-2">
              <Button asChild>
                <Link href={`/discover/${property.property_id}/book`}>
                  Request to book
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/discover/${property.property_id}/inquire`}>
                  Ask about this property
                </Link>
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Sign in with a tenant account to book.
            </p>
          )}
        </div>
      </div>

      {(property.description ||
        property.house_rules ||
        property.booking_policy) && (
        <div className="space-y-4">
          {property.description && (
            <Section title="About">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {property.description}
              </p>
            </Section>
          )}
          {property.booking_policy && (
            <Section title="Booking policy">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {property.booking_policy}
              </p>
            </Section>
          )}
          {property.house_rules && (
            <Section title="House rules">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {property.house_rules}
              </p>
            </Section>
          )}
        </div>
      )}

      {amenityGroups.length > 0 && (
        <Section title="Amenities">
          <div className="grid gap-3 sm:grid-cols-2">
            {amenityGroups.map((g) => (
              <div key={g.category}>
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  {g.category}
                </p>
                <ul className="mt-1 text-sm text-foreground">
                  {g.names.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Rooms (${rooms.length})`}>
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rooms listed for this property yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rooms.map((room) => (
              <Card key={room.roomId} className="overflow-hidden">
                {room.photos[0] && (
                  <div className="bg-muted aspect-[16/9]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={room.photos[0]}
                      alt={room.label}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {room.label}
                    </p>
                    {room.typeName && (
                      <span className="text-xs text-muted-foreground">
                        {room.typeName}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {room.bedAvailable} of {room.bedTotal} beds available · max{' '}
                    {room.maxOccupants}
                    {room.floor ? ` · floor ${room.floor}` : ''}
                  </p>
                  {advanceDepositLabel(
                    room.requireAdvance,
                    room.requireDeposit,
                  ) && (
                    <p className="mt-2 text-xs font-medium text-foreground">
                      Requires{' '}
                      {advanceDepositLabel(
                        room.requireAdvance,
                        room.requireDeposit,
                      )}
                    </p>
                  )}
                  {room.rates.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-sm text-foreground">
                      {room.rates.map((r) => (
                        <li key={r.period} className="capitalize">
                          {r.period}: {peso.format(r.price)}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Reviews (${ratings.count})`}>
        {canBook && (
          <Button asChild variant="outline" size="sm" className="mb-3">
            <Link href={`/discover/${property.property_id}/review`}>
              Write a review
            </Link>
          </Button>
        )}
        {ratings.reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <ul className="space-y-4">
            {ratings.reviews.map((r) => (
              <li
                key={r.ratingId}
                className="border-b border-border pb-4 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <StarRating value={r.rating} />
                  <span className="text-sm font-medium text-foreground">
                    {r.reviewer}
                  </span>
                </div>
                {r.review && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.review}
                  </p>
                )}
                {r.landlordResponse && (
                  <div className="mt-2 border-l-2 border-border pl-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Landlord response
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-foreground">
                      {r.landlordResponse}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}
