import { idParam, mobileRoute } from '@/lib/api/mobile'
import { getBookingFormContext } from '@/services/bookings.service'

export const dynamic = 'force-dynamic'

/** Bookable rooms → beds → rates for the booking form. */
export const GET = mobileRoute<{ id: string }>(async ({ params }) =>
  getBookingFormContext(idParam(params.id)),
)
