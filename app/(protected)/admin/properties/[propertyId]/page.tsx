import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AdminPropertyView } from '@/components/admin/admin-property-view'
import { PropertyReviewPanel } from '@/components/admin/property-review-panel'
import { requireArea } from '@/lib/auth/dal'
import { getAdminProperty } from '@/services/admin.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Property listing' }

export default async function AdminPropertyDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  await requireArea('superadmin')
  const propertyId = Number((await params).propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound()

  let detail
  try {
    detail = await getAdminProperty(propertyId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/properties"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to property listings
      </Link>
      <PropertyReviewPanel
        propertyId={propertyId}
        statusCode={detail.statusCode}
        isVerified={detail.property.is_verified}
        isFeatured={detail.property.is_featured}
      />
      <AdminPropertyView detail={detail} />
    </div>
  )
}
