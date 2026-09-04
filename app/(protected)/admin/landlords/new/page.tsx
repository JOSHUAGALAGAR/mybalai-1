import type { Metadata } from 'next'
import Link from 'next/link'

import { LandlordForm } from '@/components/admin/landlord-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { listPlansForAdmin } from '@/services/subscriptions.service'

export const metadata: Metadata = { title: 'New landlord' }

export default async function NewLandlordPage() {
  await requireArea('superadmin')
  const plans = await listPlansForAdmin()

  return (
    <div className="space-y-6">
      <Link
        href="/admin/landlords"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to landlords
      </Link>
      <PageHeader
        title="New landlord account"
        subtitle="Creates a sign-in and provisions the landlord role."
      />
      <LandlordForm
        plans={plans
          .filter((p) => p.is_active)
          .map((p) => ({ id: p.plan_id, name: p.name }))}
      />
    </div>
  )
}
