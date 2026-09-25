import { mobileRoute } from '@/lib/api/mobile'
import { getPropertyFormChoices } from '@/services/landlord-properties.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute(async () => getPropertyFormChoices(), {
  roles: ['landlord'],
})
