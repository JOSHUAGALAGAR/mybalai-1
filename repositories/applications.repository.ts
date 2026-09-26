import 'server-only'

import { APPLICATION_BUCKET } from '@/lib/applications/documents'
import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables, TablesInsert } from '@/types/database'

export type DocumentRow = Tables<'landlord_application_documents'>
export type ApplicationRow = Tables<'landlord_applications'>
export type ApplicationStatus = 'pending' | 'approved' | 'rejected'

const db = () => createAdminClient()

export async function insertApplication(
  values: TablesInsert<'landlord_applications'>,
): Promise<ApplicationRow> {
  const { data, error } = await db()
    .from('landlord_applications')
    .insert(values)
    .select('*')
    .single()
  if (error || !data)
    throw new RepositoryError('Failed to save the application.', error)
  return data
}

export async function hasPendingFor(email: string): Promise<boolean> {
  const { data, error } = await db()
    .from('landlord_applications')
    .select('application_id')
    .ilike('email', email)
    .eq('status', 'pending')
    .limit(1)
  if (error)
    throw new RepositoryError('Failed to check existing applications.', error)
  return (data ?? []).length > 0
}

/** One page of applications (oldest first while pending, newest first afterwards) and the total. */
export async function listByStatus(
  status: ApplicationStatus,
  page: number,
  pageSize: number,
): Promise<{ rows: ApplicationRow[]; total: number }> {
  const { data, error, count } = await db()
    .from('landlord_applications')
    .select('*', { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: status === 'pending' })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw new RepositoryError('Failed to load applications.', error)
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getApplication(
  id: number,
): Promise<ApplicationRow | null> {
  const { data, error } = await db()
    .from('landlord_applications')
    .select('*')
    .eq('application_id', id)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the application.', error)
  return data
}

export async function countPending(): Promise<number> {
  const { count, error } = await db()
    .from('landlord_applications')
    .select('application_id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw new RepositoryError('Failed to count applications.', error)
  return count ?? 0
}

/** Decide a PENDING application. False when someone else already decided it. */
export async function decide(
  id: number,
  patch: {
    status: 'approved' | 'rejected'
    reviewed_by: number
    reject_reason?: string
    landlord_id?: number
  },
): Promise<boolean> {
  const { data, error } = await db()
    .from('landlord_applications')
    .update({ ...patch, reviewed_at: new Date().toISOString() })
    .eq('application_id', id)
    .eq('status', 'pending')
    .select('application_id')
  if (error)
    throw new RepositoryError('Failed to update the application.', error)
  return (data ?? []).length > 0
}

/* ---- documents ---- */

export async function insertDocuments(
  values: TablesInsert<'landlord_application_documents'>[],
): Promise<void> {
  const { error } = await db()
    .from('landlord_application_documents')
    .insert(values)
  if (error) throw new RepositoryError('Failed to save the documents.', error)
}

export async function listDocumentsFor(
  applicationIds: number[],
): Promise<DocumentRow[]> {
  if (applicationIds.length === 0) return []
  const { data, error } = await db()
    .from('landlord_application_documents')
    .select('*')
    .in('application_id', applicationIds)
    .order('document_id')
  if (error) throw new RepositoryError('Failed to load the documents.', error)
  return data ?? []
}

export async function deleteApplication(id: number): Promise<void> {
  await db().from('landlord_applications').delete().eq('application_id', id)
}

export async function createSignedUpload(
  path: string,
): Promise<{ path: string; token: string }> {
  const { data, error } = await db()
    .storage.from(APPLICATION_BUCKET)
    .createSignedUploadUrl(path)
  if (error || !data) {
    throw new RepositoryError(
      'Application documents are not set up yet. Run migration 0021.',
      error,
    )
  }
  return { path: data.path, token: data.token }
}

export async function objectExists(path: string): Promise<boolean> {
  const { data, error } = await db()
    .storage.from(APPLICATION_BUCKET)
    .exists(path)
  return !error && Boolean(data)
}

/** A link that opens the private file for a short time only. */
export async function signedViewUrl(
  path: string,
  seconds = 60,
): Promise<string | null> {
  const { data, error } = await db()
    .storage.from(APPLICATION_BUCKET)
    .createSignedUrl(path, seconds)
  return error ? null : (data?.signedUrl ?? null)
}
