import type { Metadata } from 'next'
import Link from 'next/link'

import { LandlordForm } from '@/components/admin/landlord-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'New landlord' }

export default async function NewLandlordPage() {
  await requireArea('superadmin')
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
        subtitle="Creates a sign-in and provisions the landlord role. Listing properties is free — MyBalai earns a fee on completed payments and from optional boosts."
      />
      <LandlordForm />
    </div>
  )
}
