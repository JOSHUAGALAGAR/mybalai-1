import type { Metadata } from 'next'

import { InquiryList } from '@/components/inquiry/inquiry-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { listManagedInquiries } from '@/services/inquiries.service'

export const metadata: Metadata = { title: 'Inquiries' }

export default async function CaretakerInquiriesPage() {
  await requireArea('caretaker', 'superadmin')
  const items = await listManagedInquiries('caretaker')

  return (
    <div>
      <PageHeader
        title="Inquiries"
        subtitle={`${items.length} ${items.length === 1 ? 'inquiry' : 'inquiries'}`}
      />
      <InquiryList
        items={items}
        basePath="/caretaker/inquiries"
        showTenant
        emptyTitle="No inquiries"
        emptyDescription="Questions about your assigned properties appear here."
      />
    </div>
  )
}
