import 'server-only'

import * as usersRepo from '@/repositories/users.repository'
import { listManagedBookings } from '@/services/bookings.service'

/**
 * Tenant management for a landlord: the people who have a CONFIRMED (therefore paid) booking at
 * one of their properties, grouped per person. Contact details are only shown for these tenants —
 * a mere booking request does not reveal who someone is beyond their name.
 */
export type TenantStay = {
  bookingId: number
  propertyId: number
  propertyName: string
  roomLabel: string
  bedNumber: string | null
  checkIn: string
  checkOut: string
  statusCode: 'confirmed' | 'checked_in' | 'checked_out'
  statusName: string | null
  totalAmount: number
}

export type ManagedTenant = {
  tenantId: number
  name: string | null
  email: string | null
  phone: string | null
  /** Where they are now: staying (`checked_in`), arriving soon (`confirmed`), or gone (`checked_out`). */
  phase: 'current' | 'upcoming' | 'past'
  stays: TenantStay[]
}

const STAY_STATUSES = ['confirmed', 'checked_in', 'checked_out'] as const
type StayStatus = (typeof STAY_STATUSES)[number]

const isStayStatus = (code: string | null): code is StayStatus =>
  (STAY_STATUSES as readonly (string | null)[]).includes(code)

/** Current tenants first, then those arriving, then past — and by name within each group. */
const PHASE_ORDER = { current: 0, upcoming: 1, past: 2 } as const

export async function listMyTenants(): Promise<ManagedTenant[]> {
  const bookings = await listManagedBookings('landlord')

  const stays = new Map<number, TenantStay[]>()
  const names = new Map<number, string | null>()
  for (const b of bookings) {
    if (b.tenantId == null || !isStayStatus(b.statusCode)) continue
    const list = stays.get(b.tenantId) ?? []
    list.push({
      bookingId: b.bookingId,
      propertyId: b.propertyId,
      propertyName: b.propertyName,
      roomLabel: b.roomLabel,
      bedNumber: b.bedNumber,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      statusCode: b.statusCode,
      statusName: b.statusName,
      totalAmount: b.totalAmount,
    })
    stays.set(b.tenantId, list)
    names.set(b.tenantId, b.tenantName ?? null)
  }
  if (stays.size === 0) return []

  const accounts = new Map(
    (await usersRepo.listAccountsByIds([...stays.keys()])).map(
      (a) => [a.legacy_user_id, a] as const,
    ),
  )

  const tenants: ManagedTenant[] = [...stays.entries()].map(
    ([tenantId, list]) => {
      const account = accounts.get(tenantId)
      const sorted = [...list].sort((a, b) =>
        b.checkIn.localeCompare(a.checkIn),
      )
      const phase: ManagedTenant['phase'] = sorted.some(
        (s) => s.statusCode === 'checked_in',
      )
        ? 'current'
        : sorted.some((s) => s.statusCode === 'confirmed')
          ? 'upcoming'
          : 'past'
      return {
        tenantId,
        name: account?.full_name ?? names.get(tenantId) ?? null,
        email: account?.email ?? null,
        phone: account?.phone ?? null,
        phase,
        stays: sorted,
      }
    },
  )

  return tenants.sort(
    (a, b) =>
      PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
      (a.name ?? '').localeCompare(b.name ?? ''),
  )
}
