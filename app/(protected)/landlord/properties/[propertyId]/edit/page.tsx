import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { updatePropertyAction } from '@/app/(protected)/landlord/properties/actions'
import { PageHeader } from '@/components/dashboard/page-header'
import { PropertyForm } from '@/components/property/property-form'
import { requireArea } from '@/lib/auth/dal'
import { ServiceError } from '@/services/errors'
import { getPropertyFormOptions } from '@/services/properties.service'
import { requireManageableProperty } from '@/services/property-access'

export const metadata: Metadata = { title: 'Edit property' }

const s = (value: string | number | null): string =>
  value === null ? '' : String(value)

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  await requireArea('landlord', 'superadmin')
  const propertyId = Number((await params).propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound()

  let property
  try {
    property = (await requireManageableProperty(propertyId)).property
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'forbidden')
    ) {
      notFound()
    }
    throw error
  }

  const { types } = await getPropertyFormOptions()

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Edit property"
        subtitle={`${property.property_name} · #${property.property_id}`}
      />
      <PropertyForm
        action={updatePropertyAction}
        mode="edit"
        propertyId={property.property_id}
        typeOptions={types.map((t) => ({
          id: t.property_type_id,
          name: t.type_name,
        }))}
        initial={{
          property_name: property.property_name,
          address: property.address,
          property_type_id: s(property.property_type_id),
          monthly_payment_rule: s(property.monthly_payment_rule),
          contact_number: s(property.contact_number),
          latitude: s(property.latitude),
          longitude: s(property.longitude),
          google_place_id: s(property.google_place_id),
          description: s(property.description),
          booking_policy: s(property.booking_policy),
          house_rules: s(property.house_rules),
          require_advance: property.require_advance ? '1' : '0',
          require_deposit: property.require_deposit ? '1' : '0',
        }}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelHref={`/landlord/properties/${property.property_id}`}
      />
    </div>
  )
}
