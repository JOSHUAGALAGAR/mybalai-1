import type { Metadata } from 'next'

import { InquiryList } from '@/components/inquiry/inquiry-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { listManagedInquiries } from '@/services/inquiries.service'

export const metadata: Metadata = { title: 'Inquiries' }

export default async function LandlordInquiriesPage() {
  await requireArea('landlord', 'superadmin')
  const items = await listManagedInquiries('landlord')

  return (
    <div>
      <PageHeader
        title="Inquiries"
        subtitle={`${items.length} ${items.length === 1 ? 'inquiry' : 'inquiries'}`}
      />
      <InquiryList
        items={items}
        basePath="/landlord/inquiries"
        showTenant
        emptyTitle="No inquiries"
        emptyDescription="Questions from tenants about your properties appear here."
      />
    </div>
  )
}
