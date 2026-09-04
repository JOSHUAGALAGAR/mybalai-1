import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { updateRoomAction } from '@/app/(protected)/landlord/properties/actions'
import { PageHeader } from '@/components/dashboard/page-header'
import { RoomForm } from '@/components/property/room-form'
import { requireArea } from '@/lib/auth/dal'
import { ServiceError } from '@/services/errors'
import { getRoomDetail, getRoomFormOptions } from '@/services/rooms.service'

export const metadata: Metadata = { title: 'Edit room' }

const s = (value: string | number | null): string =>
  value === null ? '' : String(value)

export default async function EditRoomPage({
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

  const { property, room } = detail
  const { types } = await getRoomFormOptions()

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Edit room"
        subtitle={`${property.property_name} · #${property.property_id}`}
      />
      <RoomForm
        action={updateRoomAction}
        mode="edit"
        propertyId={property.property_id}
        roomId={room.room_id}
        typeOptions={types.map((t) => ({
          id: t.room_type_id,
          name: t.room_type_name,
        }))}
        initial={{
          room_number: s(room.room_number),
          room_name: s(room.room_name),
          room_type_id: s(room.room_type_id),
          floor: s(room.floor),
          area_sqm: s(room.area_sqm),
          max_occupants: s(room.max_occupants),
          description: s(room.description),
          room_image: s(room.room_image),
        }}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelHref={`/landlord/properties/${property.property_id}/rooms/${room.room_id}`}
      />
    </div>
  )
}
