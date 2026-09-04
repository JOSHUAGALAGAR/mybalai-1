import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { InquiryForm } from '@/components/inquiry/inquiry-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { getDiscoveryDetail } from '@/services/discovery.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Ask about this property' }

export default async function InquirePage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  await requireArea('tenant', 'superadmin')
  const propertyId = Number((await params).propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound()

  let detail
  try {
    detail = await getDiscoveryDetail(propertyId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Ask about this property"
        subtitle={detail.property.property_name}
      />
      <InquiryForm
        propertyId={propertyId}
        propertyName={detail.property.property_name}
      />
    </div>
  )
}
