/** Portal-ad rules. Pure (no I/O): shared by the server (the authority) and the admin form. */
import { extensionFor } from '@/lib/images/rules'

export const AD_BUCKET = 'portal-ads'
export const MAX_AD_IMAGE_BYTES = 3 * 1024 * 1024

export const AD_ROLES = [
  { code: 'tenant', label: 'Tenants' },
  { code: 'landlord', label: 'Landlords' },
  { code: 'caretaker', label: 'Caretakers' },
] as const
export type AdRole = (typeof AD_ROLES)[number]['code']
export const AD_ROLE_CODES = AD_ROLES.map((r) => r.code) as [
  AdRole,
  ...AdRole[],
]

export const roleLabel = (code: string): string =>
  AD_ROLES.find((r) => r.code === code)?.label ?? code

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

export function newAdImagePath(mime: string): string | null {
  const ext = extensionFor(mime)
  return ext ? `ads/${crypto.randomUUID()}.${ext}` : null
}

/** Is `path` a file name the SERVER issued for an ad picture? */
export function isAdImagePath(path: string): boolean {
  return new RegExp(`^ads/${UUID}\\.(?:jpg|png|webp)$`).test(path)
}

export type AdStatus = 'live' | 'scheduled' | 'ended' | 'paused'

export function adStatus(
  ad: { is_active: boolean; starts_at: string | null; ends_at: string | null },
  now: Date,
): AdStatus {
  if (!ad.is_active) return 'paused'
  if (ad.starts_at && new Date(ad.starts_at) > now) return 'scheduled'
  if (ad.ends_at && new Date(ad.ends_at) <= now) return 'ended'
  return 'live'
}

/** "2026-09-30" (a day the admin picked) -> the instant that day starts / ends in Manila. */
export const startOfManilaDay = (day: string): string =>
  new Date(`${day}T00:00:00+08:00`).toISOString()
export const endOfManilaDay = (day: string): string =>
  new Date(`${day}T23:59:59.999+08:00`).toISOString()

/** An instant -> the Manila calendar day, for a `<input type="date">`. */
export function manilaDay(instant: string | null): string {
  if (!instant) return ''
  return new Date(new Date(instant).getTime() + 8 * 3600_000)
    .toISOString()
    .slice(0, 10)
}
