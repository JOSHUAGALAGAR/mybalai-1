import type { Metadata } from 'next'

import { PageHeader } from '@/components/dashboard/page-header'
import { TenantList } from '@/components/tenant/tenant-list'
import { requireArea } from '@/lib/auth/dal'
import { listMyTenants } from '@/services/landlord-tenants.service'

export const metadata: Metadata = { title: 'Tenants' }
export const dynamic = 'force-dynamic'

export default async function CaretakerTenantsPage() {
  await requireArea('caretaker', 'superadmin')
  const tenants = await listMyTenants('caretaker')
  const staying = tenants.filter((t) => t.phase === 'current').length

  return (
    <div>
      <PageHeader
        title="Tenants"
        subtitle={`${tenants.length} ${tenants.length === 1 ? 'tenant' : 'tenants'} · ${staying} staying now`}
      />
      <TenantList tenants={tenants} bookingsPath="/caretaker/bookings" />
    </div>
  )
}
