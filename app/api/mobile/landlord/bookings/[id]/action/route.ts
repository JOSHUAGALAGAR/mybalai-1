import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { transitionManagedBooking } from '@/services/bookings.service'

export const dynamic = 'force-dynamic'

/**
 * Accept (`payment_pending` — the tenant is then asked to pay), reject, cancel, check in or check out.
 * Body: `{ to, response? }`. Which moves are allowed from the current status is decided by the
 * service, exactly as on the website.
 */
export const POST = mobileRoute<{ id: string }>(
  async ({ request, params }) => {
    await transitionManagedBooking(idParam(params.id), await readJson(request))
    return { ok: true }
  },
  { roles: ['landlord'] },
)
