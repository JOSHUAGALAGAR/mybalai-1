import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/dashboard/page-header'
import { BookingForm } from '@/components/booking/booking-form'
import { requireArea } from '@/lib/auth/dal'
import { getBookingFormContext } from '@/services/bookings.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Request to book' }

export default async function BookPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  await requireArea('tenant', 'superadmin')
  const propertyId = Number((await params).propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound()

  let context
  try {
    context = await getBookingFormContext(propertyId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  return (
    <div>
      <PageHeader title="Request to book" subtitle={context.property.name} />
      <BookingForm
        propertyId={context.property.propertyId}
        propertyName={context.property.name}
        rooms={context.rooms}
      />
    </div>
  )
}
