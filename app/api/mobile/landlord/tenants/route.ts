import { mobileRoute } from '@/lib/api/mobile'
import { listMyTenants } from '@/services/landlord-tenants.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute(async () => ({ items: await listMyTenants() }), {
  roles: ['landlord'],
})
