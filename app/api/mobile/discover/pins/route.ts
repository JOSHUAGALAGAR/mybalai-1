import { mobileRoute } from '@/lib/api/mobile'
import { getPropertyPins } from '@/services/discovery.service'

export const dynamic = 'force-dynamic'

/** Every visible listing with a saved location, for the tenant's map (small: name, spot, from-price). */
export const GET = mobileRoute(async () => ({ pins: await getPropertyPins() }))
