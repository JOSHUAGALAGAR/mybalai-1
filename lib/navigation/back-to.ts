/** Where a manage form may send the user back to. Anything else falls back to the given default. */
const ALLOWED = new Set([
  '/landlord/bookings',
  '/caretaker/bookings',
  '/admin/bookings',
  '/landlord/payments',
  '/caretaker/payments',
  '/admin/payments',
])

export function safeBackTo(
  value: FormDataEntryValue | null,
  fallback: string,
): string {
  return typeof value === 'string' && ALLOWED.has(value) ? value : fallback
}
