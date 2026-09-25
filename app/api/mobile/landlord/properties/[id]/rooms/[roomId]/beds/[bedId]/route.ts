import { idParam, mobileRoute } from '@/lib/api/mobile'
import { deleteBed } from '@/services/beds.service'

export const dynamic = 'force-dynamic'

export const DELETE = mobileRoute<{
  id: string
  roomId: string
  bedId: string
}>(
  async ({ params }) => {
    await deleteBed(
      idParam(params.id),
      idParam(params.roomId),
      idParam(params.bedId),
    )
    return { ok: true }
  },
  { roles: ['landlord'] },
)
