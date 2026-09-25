import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { createRoom } from '@/services/rooms.service'

export const dynamic = 'force-dynamic'

/** Body follows the website's room form (`room_name`, `room_number`, `room_type_id`, `max_occupants`, …). */
export const POST = mobileRoute<{ id: string }>(
  async ({ request, params }) => {
    const room = await createRoom(idParam(params.id), await readJson(request))
    return { roomId: room.room_id }
  },
  { roles: ['landlord'] },
)
