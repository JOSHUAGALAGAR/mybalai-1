import 'server-only'

import {
  adStatus,
  endOfManilaDay,
  isAdImagePath,
  newAdImagePath,
  startOfManilaDay,
  type AdStatus,
} from '@/lib/ads/rules'
import { getCurrentUser, requireRole } from '@/lib/auth/dal'
import { MAX_AD_IMAGE_BYTES } from '@/lib/ads/rules'
import { validateUploadFile } from '@/lib/identity/rules'
import * as repo from '@/repositories/ads.repository'
import { adFormSchema, adImageUploadSchema } from '@/schemas/ads'
import { recordAudit } from '@/services/audit.service'
import {
  ADMIN_TOOLS_SETUP_MESSAGE,
  isAdminToolsSetupProblem,
} from '@/lib/db-errors'
import { ServiceError, parseOrThrow } from '@/services/errors'

export type AdView = {
  adId: number
  title: string
  body: string | null
  imageUrl: string | null
  linkUrl: string | null
  linkLabel: string | null
  targetRoles: string[]
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  status: AdStatus
  createdAt: string
}

function toView(row: repo.AdRow, now: Date): AdView {
  return {
    adId: row.ad_id,
    title: row.title,
    body: row.body,
    imageUrl: row.image_path ? repo.publicUrl(row.image_path) : null,
    linkUrl: row.link_url,
    linkLabel: row.link_label,
    targetRoles: row.target_roles,
    isActive: row.is_active,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: adStatus(row, now),
    createdAt: row.created_at,
  }
}

export async function listAdsForAdmin(): Promise<AdView[]> {
  await requireRole('superadmin')
  const now = new Date()
  return (await repo.listAds()).map((r) => toView(r, now))
}

export async function getAdForAdmin(id: number): Promise<AdView> {
  await requireRole('superadmin')
  const row = await repo.getAd(id)
  if (!row) throw new ServiceError('Ad not found.', 'not_found')
  return toView(row, new Date())
}

export async function prepareAdImage(
  input: unknown,
): Promise<{ path: string; token: string }> {
  await requireRole('superadmin')
  const file = parseOrThrow(adImageUploadSchema, input)
  const problem = validateUploadFile(file, MAX_AD_IMAGE_BYTES)
  if (problem) throw new ServiceError(problem, 'validation')
  const path = newAdImagePath(file.type)
  if (!path) throw new ServiceError('Unsupported image type.', 'validation')
  return withSetupHint(() => repo.createSignedUpload(path))
}

/** Turn "the migration is missing" into a message an admin can act on. */
async function withSetupHint<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (isAdminToolsSetupProblem(error)) {
      throw new ServiceError(ADMIN_TOOLS_SETUP_MESSAGE, 'conflict')
    }
    throw error
  }
}

async function checkImagePath(path: string | undefined): Promise<void> {
  if (!path) return
  if (!isAdImagePath(path))
    throw new ServiceError(
      'That picture was not uploaded for ads.',
      'forbidden',
    )
  if (!(await repo.objectExists(path))) {
    throw new ServiceError(
      'The picture did not finish uploading. Please try again.',
      'conflict',
    )
  }
}

function valuesFrom(d: ReturnType<typeof adFormSchema.parse>) {
  return {
    title: d.title,
    body: d.body ?? null,
    link_url: d.link_url ?? null,
    // a button label without a link is meaningless
    link_label: d.link_url ? (d.link_label ?? null) : null,
    target_roles: d.target_roles,
    is_active: d.is_active,
    starts_at: d.starts_on ? startOfManilaDay(d.starts_on) : null,
    ends_at: d.ends_on ? endOfManilaDay(d.ends_on) : null,
  }
}

export async function createAd(input: unknown): Promise<AdView> {
  const actor = await requireRole('superadmin')
  const d = parseOrThrow(adFormSchema, input)
  await checkImagePath(d.image_path)
  const row = await repo.insertAd({
    ...valuesFrom(d),
    image_path: d.image_path ?? null,
    created_by: actor.legacyUserId,
  })
  await recordAudit({
    actor,
    action: 'ad.created',
    targetType: 'ad',
    targetId: row.ad_id,
    summary: `Created ad “${row.title}” for ${row.target_roles.join(', ')}`,
  })
  return toView(row, new Date())
}

export async function updateAd(id: number, input: unknown): Promise<AdView> {
  const actor = await requireRole('superadmin')
  const existing = await repo.getAd(id)
  if (!existing) throw new ServiceError('Ad not found.', 'not_found')
  const d = parseOrThrow(adFormSchema, input)
  await checkImagePath(d.image_path)

  let imagePath = existing.image_path
  if (d.image_path) imagePath = d.image_path
  else if (d.remove_image) imagePath = null

  const row = await repo.updateAd(id, {
    ...valuesFrom(d),
    image_path: imagePath,
  })
  if (existing.image_path && existing.image_path !== imagePath) {
    await repo.removeObjects([existing.image_path]).catch(() => {})
  }
  await recordAudit({
    actor,
    action: 'ad.updated',
    targetType: 'ad',
    targetId: id,
    summary: `Updated ad “${row.title}”${row.is_active ? '' : ' (paused)'}`,
    details: { is_active: row.is_active },
  })
  return toView(row, new Date())
}

export async function setAdActive(
  id: number,
  isActive: boolean,
): Promise<void> {
  const actor = await requireRole('superadmin')
  const existing = await repo.getAd(id)
  if (!existing) throw new ServiceError('Ad not found.', 'not_found')
  await repo.updateAd(id, { is_active: isActive })
  await recordAudit({
    actor,
    action: 'ad.updated',
    targetType: 'ad',
    targetId: id,
    summary: `${isActive ? 'Resumed' : 'Paused'} ad “${existing.title}”`,
    details: { is_active: isActive },
  })
}

export async function deleteAd(id: number): Promise<void> {
  const actor = await requireRole('superadmin')
  const existing = await repo.getAd(id)
  if (!existing) throw new ServiceError('Ad not found.', 'not_found')
  await repo.deleteAd(id)
  if (existing.image_path)
    await repo.removeObjects([existing.image_path]).catch(() => {})
  await recordAudit({
    actor,
    action: 'ad.deleted',
    targetType: 'ad',
    targetId: id,
    summary: `Deleted ad “${existing.title}”`,
  })
}

/**
 * Ads to show the signed-in person, by their role. NEVER throws: a missing table or a hiccup
 * must not break the dashboard the banner sits on.
 */
export async function liveAdsForCurrentUser(): Promise<AdView[]> {
  try {
    const user = await getCurrentUser()
    if (!user) return []
    const roles = (['landlord', 'caretaker', 'tenant'] as const).filter((r) =>
      user.roles.includes(r),
    )
    if (roles.length === 0) return []
    const now = new Date()
    const seen = new Map<number, repo.AdRow>()
    for (const role of roles) {
      for (const ad of await repo.listLiveAdsForRole(role, now.toISOString()))
        seen.set(ad.ad_id, ad)
    }
    return [...seen.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 3)
      .map((r) => toView(r, now))
  } catch (error) {
    console.error('[ads] could not load live ads:', error)
    return []
  }
}
