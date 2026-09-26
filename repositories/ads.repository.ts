import 'server-only'

import { AD_BUCKET } from '@/lib/ads/rules'
import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

type DbRow = Tables<'portal_ads'>

/**
 * The app's view of an ad. `portal_ads` predates the admin console (message / storage_path /
 * comma-separated target_roles), so the mapping lives here and nothing else needs to know.
 */
export type AdRow = {
  ad_id: number
  title: string
  body: string | null
  image_path: string | null
  link_url: string | null
  link_label: string | null
  target_roles: string[]
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  created_by: number | null
  created_at: string
  updated_at: string
}

const ALL_ROLES = ['tenant', 'landlord', 'caretaker']

/** "tenant,landlord" -> [...]; empty / "all" (legacy) means everyone. */
export function parseRoles(value: string | null): string[] {
  const list = (value ?? '')
    .split(/[,\s]+/)
    .map((r) => r.trim().toLowerCase())
    .filter((r) => ALL_ROLES.includes(r))
  return list.length > 0 ? list : ALL_ROLES
}

const fromDb = (r: DbRow): AdRow => ({
  ad_id: r.ad_id,
  title: r.title,
  body: r.message,
  image_path: r.storage_path,
  link_url: r.link_url,
  link_label: r.link_label,
  target_roles: parseRoles(r.target_roles),
  is_active: r.is_active,
  starts_at: r.starts_at,
  ends_at: r.ends_at,
  created_by: r.created_by,
  created_at: r.created_at,
  updated_at: r.updated_at ?? r.created_at,
})

export type AdValues = {
  title: string
  body: string | null
  image_path: string | null
  link_url: string | null
  link_label: string | null
  target_roles: string[]
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
}

const toDb = (v: AdValues) => ({
  title: v.title,
  message: v.body,
  storage_path: v.image_path,
  image_filename: v.image_path ? (v.image_path.split('/').pop() ?? null) : null,
  link_url: v.link_url,
  link_label: v.link_label,
  target_roles: v.target_roles.join(','),
  is_active: v.is_active,
  starts_at: v.starts_at,
  ends_at: v.ends_at,
})

const db = () => createAdminClient()

export async function listAds(): Promise<AdRow[]> {
  const { data, error } = await db()
    .from('portal_ads')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load ads.', error)
  return (data ?? []).map((r) => fromDb(r as DbRow))
}

export async function getAd(id: number): Promise<AdRow | null> {
  const { data, error } = await db()
    .from('portal_ads')
    .select('*')
    .eq('ad_id', id)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the ad.', error)
  return data ? fromDb(data as DbRow) : null
}

export async function insertAd(
  values: AdValues & { created_by: number | null },
): Promise<AdRow> {
  const { data, error } = await db()
    .from('portal_ads')
    .insert({
      ...toDb(values),
      created_by: values.created_by,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error || !data)
    throw new RepositoryError('Failed to create the ad.', error)
  return fromDb(data as DbRow)
}

export async function updateAd(
  id: number,
  values: Partial<AdValues>,
): Promise<AdRow> {
  const patch: Record<string, unknown> = {}
  const full = toDb({
    title: '',
    body: null,
    image_path: null,
    link_url: null,
    link_label: null,
    target_roles: [],
    is_active: false,
    starts_at: null,
    ends_at: null,
    ...values,
  })
  const map: Record<keyof AdValues, string[]> = {
    title: ['title'],
    body: ['message'],
    image_path: ['storage_path', 'image_filename'],
    link_url: ['link_url'],
    link_label: ['link_label'],
    target_roles: ['target_roles'],
    is_active: ['is_active'],
    starts_at: ['starts_at'],
    ends_at: ['ends_at'],
  }
  for (const key of Object.keys(values) as (keyof AdValues)[]) {
    for (const column of map[key]) {
      patch[column] = (full as Record<string, unknown>)[column]
    }
  }
  const { data, error } = await db()
    .from('portal_ads')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('ad_id', id)
    .select('*')
    .single()
  if (error || !data)
    throw new RepositoryError('Failed to update the ad.', error)
  return fromDb(data as DbRow)
}

export async function deleteAd(id: number): Promise<void> {
  const { error } = await db().from('portal_ads').delete().eq('ad_id', id)
  if (error) throw new RepositoryError('Failed to delete the ad.', error)
}

/** Active ads for one role whose window contains `now`. */
export async function listLiveAdsForRole(
  role: string,
  nowIso: string,
): Promise<AdRow[]> {
  const { data, error } = await db()
    .from('portal_ads')
    .select('*')
    .eq('is_active', true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new RepositoryError('Failed to load ads.', error)
  return (data ?? [])
    .map((r) => fromDb(r as DbRow))
    .filter((ad) => ad.target_roles.includes(role))
    .slice(0, 5)
}

/* ---- pictures ---- */

export async function createSignedUpload(
  path: string,
): Promise<{ path: string; token: string }> {
  const { data, error } = await db()
    .storage.from(AD_BUCKET)
    .createSignedUploadUrl(path)
  if (error || !data) {
    throw new RepositoryError(
      'Ad pictures are not set up yet. Run migration 0016 first.',
      error,
    )
  }
  return { path: data.path, token: data.token }
}

export async function objectExists(path: string): Promise<boolean> {
  const { data, error } = await db().storage.from(AD_BUCKET).exists(path)
  return !error && Boolean(data)
}

export const publicUrl = (path: string): string =>
  db().storage.from(AD_BUCKET).getPublicUrl(path).data.publicUrl

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await db().storage.from(AD_BUCKET).remove(paths)
}
