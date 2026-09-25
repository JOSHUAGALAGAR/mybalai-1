import { idParam, mobileRoute } from '@/lib/api/mobile'
import { deleteRate } from '@/services/rental-rates.service'

export const dynamic = 'force-dynamic'

export const DELETE = mobileRoute<{ id: string; rateId: string }>(
  async ({ params }) => {
    await deleteRate(idParam(params.id), idParam(params.rateId))
    return { ok: true }
  },
  { roles: ['landlord'] },
)
