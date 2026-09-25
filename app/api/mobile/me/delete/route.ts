import { mobileRoute, readJson } from '@/lib/api/mobile'
import {
  checkAccountDeletion,
  deleteMyAccount,
} from '@/services/account-deletion.service'

export const dynamic = 'force-dynamic'

/** Can this account be deleted right now, and if not, why? */
export const GET = mobileRoute(() => checkAccountDeletion(), {
  roles: ['tenant', 'landlord'],
})

/** Body: `{ confirm: 'DELETE' }`. Needs a password sign-in from the last few minutes. */
export const POST = mobileRoute(
  async ({ request }) => {
    await deleteMyAccount(await readJson(request))
    return { deleted: true }
  },
  { roles: ['tenant', 'landlord'] },
)
