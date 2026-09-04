import type { Metadata } from 'next'
import Link from 'next/link'

import { AdminPropertyFilter } from '@/components/admin/admin-property-filter'
import { AdminPropertyTable } from '@/components/admin/admin-property-table'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { listAdminProperties } from '@/services/admin.service'

export const metadata: Metadata = { title: 'Property listings' }

type SearchParams = Record<string, string | string[] | undefined>

export default async function AdminPropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('superadmin')
  const statusParam = (await searchParams).status
  const status = typeof statusParam === 'string' ? statusParam : null

  const items = await listAdminProperties(status ?? undefined)

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to admin
      </Link>
      <PageHeader
        title="Property listings"
        subtitle={`${items.length} ${
          items.length === 1 ? 'property' : 'properties'
        }${status ? ` · ${status}` : ' · all statuses'}`}
      />
      <AdminPropertyFilter basePath="/admin/properties" active={status} />
      <AdminPropertyTable items={items} />
    </div>
  )
}
