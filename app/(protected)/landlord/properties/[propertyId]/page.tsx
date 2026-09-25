import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { archivePropertyAction } from '@/app/(protected)/landlord/properties/actions'
import { AmenitiesEditor } from '@/components/property/amenities-editor'
import { ConfirmButton } from '@/components/property/confirm-button'
import { StatusBadge } from '@/components/property/property-status-badge'
import { PhotoManager } from '@/components/property/photo-manager'
import { RateManager } from '@/components/property/rate-manager'
import { Button } from '@/components/ui/button'
import { requireArea } from '@/lib/auth/dal'
import { advanceDepositLabel } from '@/schemas/booking'
import { getBedStatuses } from '@/services/beds.service'
import { ServiceError } from '@/services/errors'
import { listGallery } from '@/services/property-images.service'
import {
  getPropertyFormOptions,
  getPropertyOverview,
} from '@/services/properties.service'
import { getRoomFormOptions } from '@/services/rooms.service'

export const metadata: Metadata = { title: 'Property' }

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  await requireArea('landlord', 'superadmin')
  const propertyId = Number((await params).propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound()

  let overview
  try {
    overview = await getPropertyOverview(propertyId)
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'forbidden')
    ) {
      notFound()
    }
    throw error
  }

  const { property, rooms, beds, rates, amenityIds } = overview
  const [{ types, statuses, amenities }, roomOpts, bedStatuses, gallery] =
    await Promise.all([
      getPropertyFormOptions(),
      getRoomFormOptions(),
      getBedStatuses(),
      listGallery({ kind: 'property', propertyId }).catch((error) => {
        // Photo tables missing (migration 0013 not applied): the page still works without them.
        if (error instanceof ServiceError) throw error
        console.error('[landlord] gallery unavailable:', error)
        return null
      }),
    ])

  const propStatus = statuses.find(
    (s) => s.property_status_id === property.status_id,
  )
  const typeName =
    types.find((t) => t.property_type_id === property.property_type_id)
      ?.type_name ?? null
  const roomStatusById = new Map(
    roomOpts.statuses.map((s) => [
      s.room_status_id,
      { code: s.status_code, name: s.status_name },
    ]),
  )
  const bedStatusById = new Map(
    bedStatuses.map((s) => [
      s.bed_status_id,
      { code: s.status_code, name: s.status_name },
    ]),
  )
  const roomLabel = (r: {
    room_id: number
    room_name: string | null
    room_number: string | null
  }) =>
    r.room_name || r.room_number
      ? `${r.room_name ?? ''}${r.room_name && r.room_number ? ' · ' : ''}${r.room_number ?? ''}`.trim()
      : `Room #${r.room_id}`

  const bedsByStatus = new Map<string, number>()
  for (const bed of beds) {
    const label =
      (bed.status_id != null && bedStatusById.get(bed.status_id)?.name) ||
      'Unknown'
    bedsByStatus.set(label, (bedsByStatus.get(label) ?? 0) + 1)
  }

  const details: Array<[string, string | null]> = [
    ['Type', typeName],
    ['Contact number', property.contact_number],
    ['Monthly payment rule', property.monthly_payment_rule],
    [
      'Advance & deposit (default for rooms)',
      advanceDepositLabel(property.require_advance, property.require_deposit),
    ],
    [
      'Coordinates',
      property.latitude != null && property.longitude != null
        ? `${property.latitude}, ${property.longitude}`
        : null,
    ],
    ['Description', property.description],
    ['Booking policy', property.booking_policy],
    ['House rules', property.house_rules],
  ]

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/landlord/properties"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to properties
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {property.property_name}
            </h1>
            <StatusBadge
              code={propStatus?.status_code ?? null}
              label={propStatus?.status_name ?? null}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {property.address} · #{property.property_id}
            {property.is_verified && ' · Verified'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/landlord/properties/${property.property_id}/edit`}>
              Edit
            </Link>
          </Button>
          <ConfirmButton
            action={archivePropertyAction}
            confirm="Archive this property? It will be hidden from all listings."
            hidden={{ property_id: property.property_id }}
          >
            Archive
          </ConfirmButton>
        </div>
      </div>

      <PhotoManager
        target={{ kind: 'property', propertyId: property.property_id }}
        initialImages={gallery}
      />

      {(property.description ||
        property.contact_number ||
        typeName ||
        property.booking_policy) && (
        <dl className="divide-y divide-border rounded-lg border border-border bg-card">
          {details
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div
                key={label}
                className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4"
              >
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-sm whitespace-pre-wrap text-foreground">
                  {value}
                </dd>
              </div>
            ))}
        </dl>
      )}

      {/* Rooms */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Rooms{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({rooms.length})
            </span>
          </h2>
          <Button asChild size="sm" variant="secondary">
            <Link
              href={`/landlord/properties/${property.property_id}/rooms/new`}
            >
              Add room
            </Link>
          </Button>
        </div>
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rooms.map((room) => {
              const rs =
                room.status_id != null
                  ? roomStatusById.get(room.status_id)
                  : undefined
              const bedCount = beds.filter(
                (b) => b.room_id === room.room_id,
              ).length
              return (
                <li key={room.room_id}>
                  <Link
                    href={`/landlord/properties/${property.property_id}/rooms/${room.room_id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {roomLabel(room)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {bedCount} {bedCount === 1 ? 'bed' : 'beds'} · max{' '}
                        {room.max_occupants}
                      </span>
                    </span>
                    <StatusBadge
                      code={rs?.code ?? null}
                      label={rs?.name ?? null}
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Availability */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Availability
        </h2>
        {beds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No beds configured yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {[...bedsByStatus.entries()].map(([label, count]) => (
              <div
                key={label}
                className="rounded-lg border border-border bg-card px-4 py-3"
              >
                <p className="text-xs text-muted-foreground capitalize">
                  {label}
                </p>
                <p className="text-xl font-semibold text-foreground">{count}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rental rates */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Rental rates
        </h2>
        <RateManager
          propertyId={property.property_id}
          rooms={rooms.map((r) => ({
            room_id: r.room_id,
            label: roomLabel(r),
          }))}
          rates={rates.map((rate) => {
            const rr = rooms.find((r) => r.room_id === rate.room_id)
            return {
              rate_id: rate.rate_id,
              room_id: rate.room_id,
              room_label: rr ? roomLabel(rr) : `Room #${rate.room_id}`,
              period: rate.period,
              price: Number(rate.price),
              valid_from: rate.valid_from,
              valid_until: rate.valid_until,
            }
          })}
        />
      </section>

      {/* Amenities */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Amenities
        </h2>
        <AmenitiesEditor
          propertyId={property.property_id}
          amenities={amenities}
          selectedIds={amenityIds}
        />
      </section>
    </div>
  )
}
