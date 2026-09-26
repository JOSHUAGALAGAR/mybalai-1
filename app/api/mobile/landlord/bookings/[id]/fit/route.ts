import { idParam, mobileRoute } from '@/lib/api/mobile'
import { getHousemateFit } from '@/services/allocation.service'

export const dynamic = 'force-dynamic'

/** How well a booking request fits the people already in that shared room (advice only). */
export const GET = mobileRoute<{ id: string }>(
  async ({ params }) => ({ fit: await getHousemateFit(idParam(params.id)) }),
  { roles: ['landlord'] },
)
