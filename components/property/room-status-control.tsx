'use client'

import { setRoomStatusAction } from '@/app/(protected)/caretaker/properties/actions'
import { nativeControlClass } from '@/components/ui/form-field'
import { ROOM_STATUSES } from '@/schemas/room'

export function RoomStatusControl({
  propertyId,
  roomId,
  current,
}: {
  propertyId: number
  roomId: number
  current: string | null
}) {
  return (
    <form action={setRoomStatusAction} className="flex items-center gap-2">
      <input type="hidden" name="property_id" value={propertyId} />
      <input type="hidden" name="room_id" value={roomId} />
      <label htmlFor="room-status" className="text-sm text-muted-foreground">
        Status
      </label>
      <select
        id="room-status"
        name="status_code"
        className={`${nativeControlClass} h-8 w-40`}
        defaultValue={current ?? 'available'}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {ROOM_STATUSES.map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
      </select>
    </form>
  )
}
