import type { Metadata } from 'next'

import { BookingList } from '@/components/booking/booking-list'
import { StatusFilterTabs } from '@/components/booking/status-filter-tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { BOOKING_TRANSITIONS } from '@/schemas/booking'
import { listManagedBookings } from '@/services/bookings.service'

export const metadata: Metadata = { title: 'Bookings' }

const VALID_STATUS = new Set<string>([...BOOKING_TRANSITIONS, 'pending'])

type SearchParams = Record<string, string | string[] | undefined>

export default async function CaretakerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('caretaker', 'superadmin')
  const raw = (await searchParams).status
  const status = typeof raw === 'string' && VALID_STATUS.has(raw) ? raw : null

  const bookings = await listManagedBookings('caretaker', status ?? undefined)

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle={`${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'}`}
      />
      <StatusFilterTabs basePath="/caretaker/bookings" active={status} />
      <BookingList
        items={bookings}
        basePath="/caretaker/bookings"
        showTenant
        emptyTitle="No bookings"
        emptyDescription="Bookings for your assigned properties will appear here."
      />
    </div>
  )
}
