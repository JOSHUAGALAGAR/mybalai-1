import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BookingDetailView } from '@/components/booking/booking-detail-view'
import { ExtensionList } from '@/components/extension/extension-list'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { requireArea } from '@/lib/auth/dal'
import { getMyBooking } from '@/services/bookings.service'
import {
  getBookingExtensions,
  getExtensionContext,
} from '@/services/extensions.service'
import { isPaymongoConfigured } from '@/services/paymongo.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Booking' }

type SearchParams = Record<string, string | string[] | undefined>

const CAN_REVIEW = new Set(['checked_in', 'checked_out'])

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>
  searchParams: Promise<SearchParams>
}) {
  await requireArea('tenant', 'superadmin')
  const bookingId = Number((await params).bookingId)
  if (!Number.isInteger(bookingId) || bookingId <= 0) notFound()
  const sp = await searchParams
  const created = Boolean(sp.created)
  const extensionRequested = sp.extension === 'requested'

  let detail
  try {
    detail = await getMyBooking(bookingId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  const [extensions, extCtx] = await Promise.all([
    getBookingExtensions(bookingId, 'tenant'),
    getExtensionContext(bookingId).catch(() => null),
  ])

  const extras = (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Extensions</h2>
        <div className="flex gap-2">
          {extCtx?.canRequest && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/bookings/${bookingId}/extend`}>
                Request an extension
              </Link>
            </Button>
          )}
          {CAN_REVIEW.has(detail.statusCode ?? '') && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/discover/${detail.propertyId}/review`}>
                Rate this stay
              </Link>
            </Button>
          )}
        </div>
      </div>
      <ExtensionList
        items={extensions}
        bookingId={bookingId}
        mode={{ kind: 'tenant' }}
      />
    </section>
  )

  return (
    <div className="space-y-6">
      <Link
        href="/bookings"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to bookings
      </Link>
      {created && (
        <Alert>
          <AlertDescription>
            Your booking request was sent. The landlord will review it.
          </AlertDescription>
        </Alert>
      )}
      {extensionRequested && (
        <Alert>
          <AlertDescription>
            Your extension request was sent. The landlord will review it.
          </AlertDescription>
        </Alert>
      )}
      <BookingDetailView
        detail={detail}
        mode={{ kind: 'tenant' }}
        extras={extras}
        onlinePaymentEnabled={isPaymongoConfigured()}
      />
    </div>
  )
}
