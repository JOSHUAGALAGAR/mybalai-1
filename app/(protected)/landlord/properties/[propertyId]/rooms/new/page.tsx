import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { createRoomAction } from '@/app/(protected)/landlord/properties/actions'
import { PageHeader } from '@/components/dashboard/page-header'
import { RoomForm } from '@/components/property/room-form'
import { requireArea } from '@/lib/auth/dal'
import { ServiceError } from '@/services/errors'
import { requireManageableProperty } from '@/services/property-access'
import { getRoomFormOptions } from '@/services/rooms.service'

export const metadata: Metadata = { title: 'Add room' }

export default async function NewRoomPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  await requireArea('landlord', 'superadmin')
  const propertyId = Number((await params).propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound()

  let property
  try {
    property = (await requireManageableProperty(propertyId)).property
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'forbidden')
    ) {
      notFound()
    }
    throw error
  }

  const { types } = await getRoomFormOptions()

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Add room"
        subtitle={`${property.property_name} · #${property.property_id}`}
      />
      <RoomForm
        action={createRoomAction}
        mode="create"
        propertyId={property.property_id}
        typeOptions={types.map((t) => ({
          id: t.room_type_id,
          name: t.room_type_name,
        }))}
        submitLabel="Create room"
        pendingLabel="Creating…"
        cancelHref={`/landlord/properties/${property.property_id}`}
      />
    </div>
  )
}
