import type { Metadata } from 'next'

import { PageHeader } from '@/components/dashboard/page-header'
import { TenantList } from '@/components/tenant/tenant-list'
import { requireArea } from '@/lib/auth/dal'
import { listMyTenants } from '@/services/landlord-tenants.service'

export const metadata: Metadata = { title: 'Tenants' }
export const dynamic = 'force-dynamic'

export default async function LandlordTenantsPage() {
  await requireArea('landlord', 'superadmin')
  const tenants = await listMyTenants('landlord')
  const staying = tenants.filter((t) => t.phase === 'current').length

  return (
    <div>
      <PageHeader
        title="Tenants"
        subtitle={`${tenants.length} ${tenants.length === 1 ? 'tenant' : 'tenants'} · ${staying} staying now`}
      />
      <TenantList tenants={tenants} bookingsPath="/landlord/bookings" />
    </div>
  )
}
