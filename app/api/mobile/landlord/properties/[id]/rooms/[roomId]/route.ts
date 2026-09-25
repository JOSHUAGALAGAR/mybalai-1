import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { updateRoomRequirements } from '@/services/rooms.service'

export const dynamic = 'force-dynamic'

/** Body: `{ require_advance: boolean, require_deposit: boolean }` — nothing else about the room changes. */
export const PATCH = mobileRoute<{ id: string; roomId: string }>(
  async ({ request, params }) => {
    await updateRoomRequirements(
      idParam(params.id),
      idParam(params.roomId),
      await readJson(request),
    )
    return { ok: true }
  },
  { roles: ['landlord'] },
)
