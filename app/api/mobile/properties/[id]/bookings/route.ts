import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { createBooking } from '@/services/bookings.service'

export const dynamic = 'force-dynamic'

/** Body: { room_id, bed_id, period, check_in, check_out, message? } */
export const POST = mobileRoute<{ id: string }>(async ({ request, params }) => {
  const bookingId = await createBooking(
    idParam(params.id),
    await readJson(request),
  )
  return { bookingId }
})
