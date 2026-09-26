import 'server-only'

import {
  scoreHousemates,
  type Compatibility,
  type Lifestyle,
} from '@/lib/matching/compatibility'
import { MATCHING_SETUP_MESSAGE, isMatchingSetupProblem } from '@/lib/db-errors'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as matchingRepo from '@/repositories/matching.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as roomsRepo from '@/repositories/rooms.repository'
import { ServiceError } from '@/services/errors'
import { requireOperableProperty } from '@/services/property-access'

/**
 * Room allocation support for landlords: how well a booking request fits the people who will be
 * in the same room. Advice only — the landlord still decides. It never reveals anyone's raw
 * lifestyle answers, and only uses answers people opted in to share.
 */
export type HousemateFit =
  | { kind: 'solo' }
  | ({
      kind: 'shared'
      /** The requesting tenant shared their answers (otherwise nothing can be compared). */
      tenantShared: boolean
    } & Compatibility)

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd)

const toLifestyle = (p: matchingRepo.PreferencesRow): Lifestyle => ({
  occupation: p.occupation as Lifestyle['occupation'],
  schedule: p.schedule as Lifestyle['schedule'],
  noise: p.noise as Lifestyle['noise'],
})

export async function getHousemateFit(
  bookingId: number,
): Promise<HousemateFit> {
  const booking = await bookingsRepo.getBooking(bookingId)
  if (!booking) throw new ServiceError('Booking not found.', 'not_found')
  await requireOperableProperty(booking.property_id)

  const room = await roomsRepo.getRoom(booking.room_id)
  if (!room) throw new ServiceError('Room not found.', 'not_found')
  if ((room.max_occupants ?? 1) <= 1) return { kind: 'solo' }

  try {
    const statuses = await referenceRepo.listBookingStatuses()
    const blocking = statuses
      .filter((s) => s.is_inventory_blocking)
      .map((s) => s.booking_status_id)

    const others = (
      await bookingsRepo.listBlockingBookingsForRoom(room.room_id, blocking, {
        excludeBookingId: bookingId,
      })
    ).filter(
      (o) =>
        o.user_id !== booking.user_id &&
        overlaps(
          booking.check_in_date,
          booking.check_out_date,
          o.check_in_date,
          o.check_out_date,
        ),
    )
    const housemateIds = [...new Set(others.map((o) => o.user_id))]

    const shared = await matchingRepo.listSharedLifestyles([
      booking.user_id,
      ...housemateIds,
    ])
    const byUser = new Map(shared.map((p) => [p.legacy_user_id, p]))
    const mine = byUser.get(booking.user_id)

    const fit = scoreHousemates(
      mine
        ? toLifestyle(mine)
        : { occupation: null, schedule: null, noise: null },
      housemateIds
        .map((id) => byUser.get(id))
        .filter((p): p is matchingRepo.PreferencesRow => p !== undefined)
        .map(toLifestyle),
      housemateIds.length,
    )
    return { kind: 'shared', tenantShared: mine !== undefined, ...fit }
  } catch (error) {
    if (isMatchingSetupProblem(error)) {
      throw new ServiceError(MATCHING_SETUP_MESSAGE, 'conflict')
    }
    throw error
  }
}
