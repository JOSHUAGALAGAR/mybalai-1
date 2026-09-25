import { z } from 'zod'

import { mobileRoute, readJson } from '@/lib/api/mobile'
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.service'
import { parseOrThrow } from '@/services/errors'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ id: z.number().int().positive().optional() })

/** Body: `{ id }` marks one read; `{}` marks all read. Scoped to the caller by the service. */
export const POST = mobileRoute(
  async ({ request }) => {
    const { id } = parseOrThrow(bodySchema, await readJson(request))
    if (id) await markNotificationRead(id)
    else await markAllNotificationsRead()
    return { ok: true }
  },
  { roles: ['tenant', 'landlord'] },
)
