import { idParam, mobileRoute } from '@/lib/api/mobile'
import { cancelMyBooking } from '@/services/bookings.service'

export const dynamic = 'force-dynamic'

export const POST = mobileRoute<{ id: string }>(async ({ params }) => {
  await cancelMyBooking(idParam(params.id))
  return { cancelled: true }
})
