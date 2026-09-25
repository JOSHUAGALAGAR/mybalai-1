import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { respondToReview } from '@/services/ratings.service'

export const dynamic = 'force-dynamic'

/** Body: `{ response }`. Only the property's owner can respond (checked by the service). */
export const POST = mobileRoute<{ id: string }>(
  async ({ request, params }) => {
    await respondToReview(idParam(params.id), await readJson(request))
    return { ok: true }
  },
  { roles: ['landlord'] },
)
