import { mobileRoute, readJson } from '@/lib/api/mobile'
import { listMyPropertySummaries } from '@/services/landlord-properties.service'
import { createProperty } from '@/services/properties.service'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute(
  async () => ({ items: await listMyPropertySummaries() }),
  {
    roles: ['landlord'],
  },
)

/**
 * Create a property. Body follows the website's form (`property_name`, `address`, `property_type_id`,
 * `description`, `house_rules`, `booking_policy`, `contact_number`, `property_image`, …). The
 * validation is enforced by the service. A new property is
 * `pending` until a superadmin approves it, so it is not yet visible to tenants.
 */
export const POST = mobileRoute(
  async ({ request }) => {
    const property = await createProperty(await readJson(request))
    return { propertyId: property.property_id }
  },
  { roles: ['landlord'] },
)
