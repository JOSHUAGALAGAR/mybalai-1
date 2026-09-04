import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { InquiryDetailView } from '@/components/inquiry/inquiry-detail-view'
import { requireArea } from '@/lib/auth/dal'
import { getManagedInquiry } from '@/services/inquiries.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Inquiry' }

export default async function CaretakerInquiryDetailPage({
  params,
}: {
  params: Promise<{ inquiryId: string }>
}) {
  await requireArea('caretaker', 'superadmin')
  const inquiryId = Number((await params).inquiryId)
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) notFound()

  let detail
  try {
    detail = await getManagedInquiry(inquiryId)
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'forbidden')
    ) {
      notFound()
    }
    throw error
  }

  return (
    <div className="space-y-6">
      <Link
        href="/caretaker/inquiries"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to inquiries
      </Link>
      <InquiryDetailView
        detail={detail}
        mode={{ kind: 'manage', backTo: '/caretaker/inquiries' }}
      />
    </div>
  )
}
