import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { createRate } from '@/services/rental-rates.service'

export const dynamic = 'force-dynamic'

/** Body: `{ room_id, period, price, valid_from, valid_until? }` (dates `YYYY-MM-DD`). */
export const POST = mobileRoute<{ id: string }>(
  async ({ request, params }) => {
    const rate = await createRate(idParam(params.id), await readJson(request))
    return { rateId: rate.rate_id }
  },
  { roles: ['landlord'] },
)
