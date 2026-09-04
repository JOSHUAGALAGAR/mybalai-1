import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { InquiryDetailView } from '@/components/inquiry/inquiry-detail-view'
import { requireArea } from '@/lib/auth/dal'
import { getMyInquiry } from '@/services/inquiries.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Inquiry' }

export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ inquiryId: string }>
}) {
  await requireArea('tenant', 'superadmin')
  const inquiryId = Number((await params).inquiryId)
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) notFound()

  let detail
  try {
    detail = await getMyInquiry(inquiryId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  return (
    <div className="space-y-6">
      <Link
        href="/inquiries"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to inquiries
      </Link>
      <InquiryDetailView detail={detail} mode={{ kind: 'tenant' }} />
    </div>
  )
}
