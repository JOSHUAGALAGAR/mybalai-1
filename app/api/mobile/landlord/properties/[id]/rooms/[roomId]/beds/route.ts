import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { createBed } from '@/services/beds.service'

export const dynamic = 'force-dynamic'

/** Body: `{ bed_number }`. The plan's bed limit is enforced by the service. */
export const POST = mobileRoute<{ id: string; roomId: string }>(
  async ({ request, params }) => {
    const bed = await createBed(
      idParam(params.id),
      idParam(params.roomId),
      await readJson(request),
    )
    return { bedId: bed.bed_id }
  },
  { roles: ['landlord'] },
)
