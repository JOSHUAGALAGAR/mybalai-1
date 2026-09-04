import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BookingDetailView } from '@/components/booking/booking-detail-view'
import { ExtensionList } from '@/components/extension/extension-list'
import { requireArea } from '@/lib/auth/dal'
import { getManagedBooking } from '@/services/bookings.service'
import { getBookingExtensions } from '@/services/extensions.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Booking' }

export default async function LandlordBookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  await requireArea('landlord', 'superadmin')
  const bookingId = Number((await params).bookingId)
  if (!Number.isInteger(bookingId) || bookingId <= 0) notFound()

  let detail
  try {
    detail = await getManagedBooking(bookingId)
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'forbidden')
    ) {
      notFound()
    }
    throw error
  }

  const extensions = await getBookingExtensions(bookingId, 'manager')

  return (
    <div className="space-y-6">
      <Link
        href="/landlord/bookings"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to bookings
      </Link>
      <BookingDetailView
        detail={detail}
        mode={{ kind: 'manage', backTo: '/landlord/bookings' }}
        extras={
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Extensions
            </h2>
            <ExtensionList
              items={extensions}
              bookingId={bookingId}
              mode={{ kind: 'manage', backTo: '/landlord/bookings' }}
            />
          </section>
        }
      />
    </div>
  )
}
