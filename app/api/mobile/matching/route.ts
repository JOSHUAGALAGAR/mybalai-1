import { mobileRoute } from '@/lib/api/mobile'
import { getMyMatches } from '@/services/matching.service'

export const dynamic = 'force-dynamic'

/** Listings ranked by how well they fit the signed-in tenant (best first, with the reasons). */
export const GET = mobileRoute(async ({ request }) => {
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 10)
  return getMyMatches(Number.isFinite(limit) ? limit : 10)
})
