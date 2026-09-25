import { mobileRoute, readJson } from '@/lib/api/mobile'
import { withSetupHint } from '@/lib/db-errors'
import { avatarRequestSchema } from '@/schemas/verification'
import { parseOrThrow } from '@/services/errors'
import * as photo from '@/services/profile-photo.service'

export const dynamic = 'force-dynamic'

/**
 * Your own profile photo (tenants and landlords). `prepare` → a one-time upload link, `register`
 * → make the uploaded file your photo, `remove` → go back to the initials.
 */
export const POST = mobileRoute(
  async ({ request }) => {
    const body = parseOrThrow(avatarRequestSchema, await readJson(request))
    return withSetupHint(async () => {
      if (body.op === 'prepare') {
        return photo.prepareAvatarUpload({
          name: body.name,
          type: body.type,
          size: body.size,
        })
      }
      if (body.op === 'register')
        return photo.registerAvatar({ path: body.path })
      await photo.removeAvatar()
      return { avatarUrl: null }
    })
  },
  { roles: ['tenant', 'landlord'] },
)
