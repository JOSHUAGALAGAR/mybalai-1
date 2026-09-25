import 'server-only'

import { requireUser } from '@/lib/auth/dal'
import {
  averageRating,
  bookingStatusCounts,
  occupancyByProperty,
  overallOccupancy,
  percentChange,
  revenueByMonth,
  type OccupancyRow,
  type RevenueMonth,
  type StatusCount,
} from '@/lib/dashboard/landlord-metrics'
import { isSuperadmin } from '@/lib/permissions/properties'
import * as bedsRepo from '@/repositories/beds.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as ratingsRepo from '@/repositories/ratings.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import { listManagedBookings } from '@/services/bookings.service'
import { listManagedPayments } from '@/services/payments.service'

export type LandlordDashboard = {
  revenue: {
    months: RevenueMonth[]
    thisMonth: number
    /** % vs last month; null when last month had no revenue. */
    changePct: number | null
    total: number
  }
  occupancy: {
    overall: { occupied: number; bookable: number; pct: number | null }
    byProperty: OccupancyRow[]
  }
  bookings: { byStatus: StatusCount[]; total: number; awaitingReply: number }
  paymentsToVerify: number
  rating: { average: number; count: number } | null
  propertyCount: number
}

export async function getLandlordDashboard(): Promise<LandlordDashboard> {
  const user = await requireUser()
  const properties = await propertiesRepo.listProperties(
    isSuperadmin(user) ? {} : { ownerId: user.legacyUserId },
  )
  const propertyIds = properties.map((p) => p.property_id)

  const [bookings, payments, bedStatuses, bedsPerProperty, ratings] =
    await Promise.all([
      listManagedBookings('landlord'),
      listManagedPayments('landlord'),
      referenceRepo.listBedStatuses(),
      Promise.all(propertyIds.map((id) => bedsRepo.listBedsByProperty(id))),
      ratingsRepo.listRatingsByProperties(propertyIds),
    ])

  const bedStatusCode = new Map(
    bedStatuses.map((s) => [s.bed_status_id, s.status_code]),
  )
  const beds = bedsPerProperty.flat().map((b) => ({
    propertyId: b.property_id,
    statusCode:
      b.status_id != null ? (bedStatusCode.get(b.status_id) ?? null) : null,
  }))

  const months = revenueByMonth(payments, new Date())
  const thisMonth = months.at(-1)?.amount ?? 0
  const lastMonth = months.at(-2)?.amount ?? 0

  const byProperty = occupancyByProperty(
    properties.map((p) => ({
      propertyId: p.property_id,
      name: p.property_name,
    })),
    beds,
  )

  return {
    revenue: {
      months,
      thisMonth,
      changePct: percentChange(thisMonth, lastMonth),
      total: months.reduce((n, m) => n + m.amount, 0),
    },
    occupancy: { overall: overallOccupancy(byProperty), byProperty },
    bookings: {
      byStatus: bookingStatusCounts(bookings),
      total: bookings.length,
      awaitingReply: bookings.filter((b) => b.statusCode === 'pending').length,
    },
    paymentsToVerify: payments.filter((p) => p.statusCode === 'pending').length,
    rating: averageRating(ratings),
    propertyCount: properties.length,
  }
}
