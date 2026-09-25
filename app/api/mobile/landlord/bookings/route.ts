import { mobileRoute } from '@/lib/api/mobile'
import { listManagedBookings } from '@/services/bookings.service'

export const dynamic = 'force-dynamic'

const STATUS = new Set([
  'pending',
  'payment_pending',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'rejected',
  'expired',
])

/** The landlord's booking requests across their own properties. `?status=pending` filters. */
export const GET = mobileRoute(
  async ({ request }) => {
    const status = new URL(request.url).searchParams.get('status')
    const items = await listManagedBookings(
      'landlord',
      status && STATUS.has(status) ? status : undefined,
    )
    return { items }
  },
  { roles: ['landlord'] },
)
