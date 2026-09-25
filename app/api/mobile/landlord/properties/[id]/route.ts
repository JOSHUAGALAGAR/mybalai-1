import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { getMyPropertyDetail } from '@/services/landlord-properties.service'
import { updateProperty } from '@/services/properties.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute<{ id: string }>(
  async ({ params }) => getMyPropertyDetail(idParam(params.id)),
  { roles: ['landlord'] },
)

export const PATCH = mobileRoute<{ id: string }>(
  async ({ request, params }) => {
    await updateProperty(idParam(params.id), await readJson(request))
    return { ok: true }
  },
  { roles: ['landlord'] },
)
