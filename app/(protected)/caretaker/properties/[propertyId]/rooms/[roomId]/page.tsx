import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/dashboard/page-header'
import { BedManager } from '@/components/property/bed-manager'
import { RoomStatusControl } from '@/components/property/room-status-control'
import { StatusBadge } from '@/components/property/property-status-badge'
import { requireArea } from '@/lib/auth/dal'
import { getBedStatuses } from '@/services/beds.service'
import { ServiceError } from '@/services/errors'
import {
  getOperableRoomDetail,
  getRoomFormOptions,
} from '@/services/rooms.service'

export const metadata: Metadata = { title: 'Room' }

export default async function CaretakerRoomPage({
  params,
}: {
  params: Promise<{ propertyId: string; roomId: string }>
}) {
  await requireArea('caretaker', 'superadmin')
  const { propertyId: p, roomId: r } = await params
  const propertyId = Number(p)
  const roomId = Number(r)
  if (![propertyId, roomId].every((n) => Number.isInteger(n) && n > 0)) {
    notFound()
  }

  let detail
  try {
    detail = await getOperableRoomDetail(propertyId, roomId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  const { property, room, beds } = detail
  const [{ statuses }, bedStatuses] = await Promise.all([
    getRoomFormOptions(),
    getBedStatuses(),
  ])
  const roomStatus = statuses.find((s) => s.room_status_id === room.status_id)
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

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/caretaker/properties/${property.property_id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {property.property_name}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PageHeader title={title} />
          <StatusBadge
            code={roomStatus?.status_code ?? null}
            label={roomStatus?.status_name ?? null}
          />
        </div>
        <RoomStatusControl
          propertyId={property.property_id}
          roomId={room.room_id}
          current={roomStatus?.status_code ?? null}
        />
      </div>

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
          canManage={false}
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
