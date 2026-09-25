import { mobileRoute } from '@/lib/api/mobile'
import { parseOrThrow } from '@/services/errors'
import { discoveryQuerySchema } from '@/schemas/discovery'
import { searchProperties } from '@/services/discovery.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute(async ({ request }) => {
  const params = new URL(request.url).searchParams
  const query = parseOrThrow(discoveryQuerySchema, {
    q: params.get('q') ?? undefined,
    type: params.get('type') ?? undefined,
    min: params.get('min') ?? undefined,
    max: params.get('max') ?? undefined,
    amenities: params.getAll('amenities'),
    sort: params.get('sort') ?? undefined,
    page: params.get('page') ?? undefined,
  })
  return searchProperties(query)
})
