import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { deleteRoomAction } from '@/app/(protected)/landlord/properties/actions'
import { PageHeader } from '@/components/dashboard/page-header'
import { BedManager } from '@/components/property/bed-manager'
import { ConfirmButton } from '@/components/property/confirm-button'
import { StatusBadge } from '@/components/property/property-status-badge'
import { Button } from '@/components/ui/button'
import { requireArea } from '@/lib/auth/dal'
import { getBedStatuses } from '@/services/beds.service'
import { ServiceError } from '@/services/errors'
import { getRoomDetail, getRoomFormOptions } from '@/services/rooms.service'

export const metadata: Metadata = { title: 'Room' }

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string; roomId: string }>
}) {
  await requireArea('landlord', 'superadmin')
  const { propertyId: p, roomId: r } = await params
  const propertyId = Number(p)
  const roomId = Number(r)
  if (![propertyId, roomId].every((n) => Number.isInteger(n) && n > 0)) {
    notFound()
  }

  let detail
  try {
    detail = await getRoomDetail(propertyId, roomId)
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'forbidden')
    ) {
      notFound()
    }
    throw error
  }

  const { property, room, beds } = detail
  const [{ types, statuses }, bedStatuses] = await Promise.all([
    getRoomFormOptions(),
    getBedStatuses(),
  ])

  const roomStatus = statuses.find((s) => s.room_status_id === room.status_id)
  const roomType = types.find((t) => t.room_type_id === room.room_type_id)
  const bedStatusById = new Map(
    bedStatuses.map((s) => [
      s.bed_status_id,
      { code: s.status_code, name: s.status_name },
    ]),
  )
  const title =
    room.room_name || room.room_number
      ? [room.room_name, room.room_number].filter(Boolean).join(' · ')
      : `Room #${room.room_id}`

  const details: Array<[string, string | null]> = [
    ['Type', roomType?.room_type_name ?? null],
    ['Floor', room.floor],
    ['Area', room.area_sqm != null ? `${room.area_sqm} sqm` : null],
    ['Max occupants', String(room.max_occupants)],
    ['Description', room.description],
  ]

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/landlord/properties/${property.property_id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {property.property_name}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <PageHeader title={title} />
          <StatusBadge
            code={roomStatus?.status_code ?? null}
            label={roomStatus?.status_name ?? null}
          />
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link
              href={`/landlord/properties/${property.property_id}/rooms/${room.room_id}/edit`}
            >
              Edit
            </Link>
          </Button>
          <ConfirmButton
            action={deleteRoomAction}
            confirm="Delete this room and its beds?"
            hidden={{
              property_id: property.property_id,
              room_id: room.room_id,
            }}
          >
            Delete
          </ConfirmButton>
        </div>
      </div>

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

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Beds{' '}
          <span className="text-sm font-normal text-muted-foreground">
            ({beds.length})
          </span>
        </h2>
        <BedManager
          propertyId={property.property_id}
          roomId={room.room_id}
          beds={beds.map((bed) => {
            const bs =
              bed.status_id != null
                ? bedStatusById.get(bed.status_id)
                : undefined
            return {
              bed_id: bed.bed_id,
              bed_number: bed.bed_number,
              status_code: bs?.code ?? null,
              status_label: bs?.name ?? null,
            }
          })}
        />
      </section>
    </div>
  )
}
