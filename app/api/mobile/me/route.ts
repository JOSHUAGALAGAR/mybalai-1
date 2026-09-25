import { z } from 'zod'

import { mobileRoute, readJson } from '@/lib/api/mobile'
import { invalidateCurrentUser } from '@/lib/auth/dal'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseOrThrow, ServiceError } from '@/services/errors'
import { isIdVerified } from '@/services/verification.service'
import { profileSchema } from '@/schemas/profile'

export const dynamic = 'force-dynamic'

export const GET = mobileRoute(
  async ({ user }) => ({
    userId: user.legacyUserId,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    address: user.address,
    avatarUrl: user.avatarUrl,
    roles: user.roles,
    // Tenants only: an admin approved their government ID (shows the Verified badge).
    idVerified: user.roles.includes('tenant')
      ? await isIdVerified(user.legacyUserId)
      : false,
  }),
  { roles: ['tenant', 'landlord'] },
)

const patchSchema = z.object({
  fullName: profileSchema.shape.fullName,
  phone: profileSchema.shape.phone,
  address: profileSchema.shape.address,
})

export const PATCH = mobileRoute(
  async ({ request, user }) => {
    const input = parseOrThrow(patchSchema, await readJson(request))

    // The caller was authenticated by the bearer token; scope the write to
    // their own account row (the web action relies on RLS for the same guarantee).
    const { error } = await createAdminClient()
      .from('user_accounts')
      .update({
        full_name: input.fullName,
        phone: input.phone ?? null,
        address: input.address ?? null,
      })
      .eq('legacy_user_id', user.legacyUserId)
    if (error) {
      throw new ServiceError('Could not save your changes.', 'unknown')
    }

    // Otherwise the next request could show the old name for up to 30 s.
    invalidateCurrentUser(user.authUserId)

    return {
      fullName: input.fullName,
      phone: input.phone ?? null,
      address: input.address ?? null,
    }
  },
  { roles: ['tenant', 'landlord'] },
)
