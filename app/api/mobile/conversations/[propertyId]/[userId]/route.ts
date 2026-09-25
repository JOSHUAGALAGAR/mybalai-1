import { z } from 'zod'

import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { parseOrThrow } from '@/services/errors'
import {
  getMobileThread,
  sendMobileMessage,
} from '@/services/mobile-messaging.service'

export const dynamic = 'force-dynamic'

type Params = { propertyId: string; userId: string }

export const GET = mobileRoute<Params>(
  async ({ params }) =>
    getMobileThread(idParam(params.userId), idParam(params.propertyId)),
  { roles: ['tenant', 'landlord'] },
)

const bodySchema = z.object({ message: z.string() })

/** Body: `{ message }`. */
export const POST = mobileRoute<Params>(
  async ({ request, params }) => {
    const { message } = parseOrThrow(bodySchema, await readJson(request))
    await sendMobileMessage(
      idParam(params.userId),
      idParam(params.propertyId),
      message,
    )
    return { ok: true }
  },
  { roles: ['tenant', 'landlord'] },
)
