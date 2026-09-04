import type { Metadata } from 'next'

import { InquiryList } from '@/components/inquiry/inquiry-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { listMyInquiries } from '@/services/inquiries.service'

export const metadata: Metadata = { title: 'Inquiries' }

export default async function InquiriesPage() {
  await requireArea('tenant', 'superadmin')
  const items = await listMyInquiries()

  return (
    <div>
      <PageHeader
        title="Inquiries"
        subtitle={`${items.length} ${items.length === 1 ? 'inquiry' : 'inquiries'}`}
      />
      <InquiryList
        items={items}
        basePath="/inquiries"
        emptyTitle="No inquiries yet"
        emptyDescription="Ask a landlord a question from a property page."
      />
    </div>
  )
}
