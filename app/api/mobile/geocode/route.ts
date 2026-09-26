import { mobileRoute } from '@/lib/api/mobile'
import { runGeocode } from '@/services/geocode-request'

export const dynamic = 'force-dynamic'

/** Address search (`?q=`) and pin → address (`?lat=&lng=`) for the landlord's property form and a tenant's "Your area" in preferences. */
export const GET = mobileRoute(
  async ({ request }) => runGeocode(new URL(request.url).searchParams),
  { roles: ['tenant', 'landlord'] },
)
