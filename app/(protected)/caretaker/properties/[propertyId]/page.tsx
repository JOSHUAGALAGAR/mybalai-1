import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/dashboard/page-header'
import { StatusBadge } from '@/components/property/property-status-badge'
import { requireArea } from '@/lib/auth/dal'
import { getAssignedPropertyDetail } from '@/services/caretakers.service'
import { ServiceError } from '@/services/errors'
import { getPropertyFormOptions } from '@/services/properties.service'
import { getRoomFormOptions } from '@/services/rooms.service'

export const metadata: Metadata = { title: 'Property' }

export default async function CaretakerPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  await requireArea('caretaker', 'superadmin')
  const propertyId = Number((await params).propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound()

  let detail
  try {
    detail = await getAssignedPropertyDetail(propertyId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  const { property, rooms, beds } = detail
  const [{ statuses }, roomOpts] = await Promise.all([
    getPropertyFormOptions(),
    getRoomFormOptions(),
  ])
  const propStatus = statuses.find(
    (s) => s.property_status_id === property.status_id,
  )
  const roomStatusById = new Map(
    roomOpts.statuses.map((s) => [
      s.room_status_id,
      { code: s.status_code, name: s.status_name },
    ]),
  )

  const roomLabel = (r: {
    room_id: number
    room_name: string | null
    room_number: string | null
  }) =>
    r.room_name || r.room_number
      ? [r.room_name, r.room_number].filter(Boolean).join(' · ')
      : `Room #${r.room_id}`

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/caretaker/properties"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Assigned properties
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <PageHeader
          title={property.property_name}
          subtitle={property.address}
        />
        <StatusBadge
          code={propStatus?.status_code ?? null}
          label={propStatus?.status_name ?? null}
        />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Rooms{' '}
          <span className="text-sm font-normal text-muted-foreground">
            ({rooms.length})
          </span>
        </h2>
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms.</p>
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
                    href={`/caretaker/properties/${property.property_id}/rooms/${room.room_id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {roomLabel(room)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {bedCount} {bedCount === 1 ? 'bed' : 'beds'}
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
    </div>
  )
}
