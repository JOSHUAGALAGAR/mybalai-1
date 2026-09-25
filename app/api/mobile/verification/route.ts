import { mobileRoute, readJson } from '@/lib/api/mobile'
import { withSetupHint } from '@/lib/db-errors'
import { verificationRequestSchema } from '@/schemas/verification'
import { parseOrThrow } from '@/services/errors'
import * as verification from '@/services/verification.service'

export const dynamic = 'force-dynamic'

/** The tenant's ID-verification status (none / pending / approved / rejected). */
export const GET = mobileRoute(
  () => withSetupHint(() => verification.getMyVerification()),
  { roles: ['tenant'] },
)

/**
 * `op: 'prepare'` → one-time upload links for the front and back pictures (the phone sends them
 * straight to private storage). `op: 'submit'` → hand the uploaded pictures in for admin review.
 */
export const POST = mobileRoute(
  async ({ request }) => {
    const body = parseOrThrow(
      verificationRequestSchema,
      await readJson(request),
    )
    return withSetupHint(async () => {
      if (body.op === 'prepare') {
        return verification.prepareIdUpload({
          idType: body.idType,
          front: body.front,
          back: body.back,
        })
      }
      return verification.submitVerification({
        idType: body.idType,
        frontPath: body.frontPath,
        backPath: body.backPath,
      })
    })
  },
  { roles: ['tenant'] },
)
