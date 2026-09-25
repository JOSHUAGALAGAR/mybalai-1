import type { Place } from '@/lib/geocode/providers'

type Answer<T> = { ok: true; data: T } | { ok: false; message: string }

async function call<T>(url: string, signal?: AbortSignal): Promise<Answer<T>> {
  try {
    const res = await fetch(url, { signal })
    const body = await res.json()
    if (!res.ok) {
      return { ok: false, message: body?.error?.message ?? 'Search failed.' }
    }
    return { ok: true, data: body.data as T }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    return { ok: false, message: 'Could not reach the search service.' }
  }
}

/** Browser calls to our own `/api/geocode` (which talks to OpenStreetMap for us). */
export const geocodeClient = {
  search: (q: string, signal?: AbortSignal) =>
    call<{ places: Place[] }>(
      `/api/geocode?q=${encodeURIComponent(q)}`,
      signal,
    ),
  reverse: (lat: number, lng: number, signal?: AbortSignal) =>
    call<{ place: Place | null }>(`/api/geocode?lat=${lat}&lng=${lng}`, signal),
}
export type GeocodeClient = typeof geocodeClient
