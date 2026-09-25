import { mobileRoute } from '@/lib/api/mobile'
import { listManagedReviews } from '@/services/ratings.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute(
  async () => {
    const items = await listManagedReviews()
    const rated = items.filter((r) => r.rating > 0)
    return {
      items,
      average: rated.length
        ? Math.round(
            (rated.reduce((n, r) => n + r.rating, 0) / rated.length) * 10,
          ) / 10
        : null,
    }
  },
  { roles: ['landlord'] },
)
