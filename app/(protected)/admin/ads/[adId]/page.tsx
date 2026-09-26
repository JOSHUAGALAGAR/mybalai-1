import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { updateAdAction } from '@/app/(protected)/admin/ads/actions'
import { AdForm } from '@/components/admin/ad-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { manilaDay } from '@/lib/ads/rules'
import { requireArea } from '@/lib/auth/dal'
import { ServiceError } from '@/services/errors'
import { getAdForAdmin } from '@/services/ads.service'

export const metadata: Metadata = { title: 'Edit ad' }

export default async function EditAdPage({
  params,
}: {
  params: Promise<{ adId: string }>
}) {
  await requireArea('superadmin')
  const adId = Number((await params).adId)
  if (!Number.isInteger(adId) || adId <= 0) notFound()

  let ad
  try {
    ad = await getAdForAdmin(adId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/ads"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to ads
      </Link>
      <PageHeader title="Edit ad" />
      <AdForm
        action={updateAdAction}
        adId={adId}
        initialImageUrl={ad.imageUrl}
        submitLabel="Save changes"
        initial={{
          title: ad.title,
          body: ad.body ?? '',
          link_url: ad.linkUrl ?? '',
          link_label: ad.linkLabel ?? '',
          target_roles: ad.targetRoles,
          is_active: ad.isActive ? 'true' : '',
          starts_on: manilaDay(ad.startsAt),
          ends_on: manilaDay(ad.endsAt),
        }}
      />
    </div>
  )
}
