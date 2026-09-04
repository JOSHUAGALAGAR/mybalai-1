import type { Metadata } from 'next'

import { createPropertyAction } from '@/app/(protected)/landlord/properties/actions'
import { PageHeader } from '@/components/dashboard/page-header'
import { PropertyForm } from '@/components/property/property-form'
import { requireArea } from '@/lib/auth/dal'
import { getPropertyFormOptions } from '@/services/properties.service'

export const metadata: Metadata = { title: 'Add property' }

export default async function NewPropertyPage() {
  await requireArea('landlord', 'superadmin')
  const { types } = await getPropertyFormOptions()

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Add property"
        subtitle="New properties start as pending until a superadmin approves them."
      />
      <PropertyForm
        action={createPropertyAction}
        mode="create"
        typeOptions={types.map((t) => ({
          id: t.property_type_id,
          name: t.type_name,
        }))}
        submitLabel="Create property"
        pendingLabel="Creating…"
        cancelHref="/landlord/properties"
      />
    </div>
  )
}
