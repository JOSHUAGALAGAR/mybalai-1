import { mobileRoute } from '@/lib/api/mobile'
import { listMyBookings } from '@/services/bookings.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute(async () => ({ items: await listMyBookings() }))
