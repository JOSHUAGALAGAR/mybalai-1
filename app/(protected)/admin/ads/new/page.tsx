import type { Metadata } from 'next'
import Link from 'next/link'

import { createAdAction } from '@/app/(protected)/admin/ads/actions'
import { AdForm } from '@/components/admin/ad-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'New ad' }

export default async function NewAdPage() {
  await requireArea('superadmin')
  return (
    <div className="space-y-6">
      <Link
        href="/admin/ads"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to ads
      </Link>
      <PageHeader title="New ad" />
      <AdForm
        action={createAdAction}
        initial={{ is_active: 'true' }}
        submitLabel="Create ad"
      />
    </div>
  )
}
