import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/dashboard/page-header'
import { RatingForm } from '@/components/rating/rating-form'
import { requireArea } from '@/lib/auth/dal'
import { getRatingContext } from '@/services/ratings.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Write a review' }

export default async function ReviewPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  await requireArea('tenant', 'superadmin')
  const propertyId = Number((await params).propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound()

  let ctx
  try {
    ctx = await getRatingContext(propertyId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  if (!ctx.canRate) redirect(`/discover/${propertyId}`)

  return (
    <div className="space-y-6">
      <Link
        href={`/discover/${propertyId}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to property
      </Link>
      <PageHeader
        title={ctx.existing ? 'Edit your review' : 'Write a review'}
        subtitle={ctx.propertyName}
      />
      <RatingForm
        propertyId={propertyId}
        propertyName={ctx.propertyName}
        existing={ctx.existing}
      />
    </div>
  )
}
