import { mobileRoute, readJson } from '@/lib/api/mobile'
import {
  clearMyPreferences,
  getMyPreferences,
  saveMyPreferences,
} from '@/services/matching.service'

export const dynamic = 'force-dynamic'

/** What the tenant told us they are looking for (`null` until they do). */
export const GET = mobileRoute(async () => ({
  preferences: await getMyPreferences(),
}))

export const PUT = mobileRoute(async ({ request }) => ({
  preferences: await saveMyPreferences(await readJson(request)),
}))

export const DELETE = mobileRoute(async () => {
  await clearMyPreferences()
  return { preferences: null }
})
