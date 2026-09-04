import type { Metadata } from 'next'

import { BookingList } from '@/components/booking/booking-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { listMyBookings } from '@/services/bookings.service'

export const metadata: Metadata = { title: 'Bookings' }

export default async function BookingsPage() {
  await requireArea('tenant', 'superadmin')
  const bookings = await listMyBookings()

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle={`${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'}`}
      />
      <BookingList
        items={bookings}
        basePath="/bookings"
        emptyTitle="No bookings yet"
        emptyDescription="Find a place and send a booking request to get started."
      />
    </div>
  )
}
