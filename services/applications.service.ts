import 'server-only'

import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import {
  DOC_TYPE_CODES,
  MAX_DOCS_TOTAL,
  docTypeLabel,
  isBatchId,
  isDocPathFor,
  newDocPath,
  validateDocFile,
  type DocTypeCode,
} from '@/lib/applications/documents'
import { requireRole } from '@/lib/auth/dal'
import { createAdminClient } from '@/lib/supabase/admin'
import { temporaryPassword } from '@/lib/temporary-password'
import {
  APPLICATIONS_SETUP_MESSAGE,
  isApplicationsSetupProblem,
} from '@/lib/db-errors'
import * as repo from '@/repositories/applications.repository'
import * as usersRepo from '@/repositories/users.repository'
import {
  landlordApplicationSchema,
  rejectApplicationSchema,
} from '@/schemas/application'
import { createLandlord } from '@/services/admin.service'
import { recordAudit } from '@/services/audit.service'
import { ServiceError, parseOrThrow } from '@/services/errors'

async function withSetupHint<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (isApplicationsSetupProblem(error)) {
      throw new ServiceError(APPLICATIONS_SETUP_MESSAGE, 'conflict')
    }
    throw error
  }
}

/* ------------------------------------------------------------------ *
 * Public — a property owner applies (no sign-in)
 * ------------------------------------------------------------------ */

export const applicationReference = (id: number) =>
  `APP-${String(id).padStart(5, '0')}`

/**
 * Save an application. Anyone on the internet can call this, so it is strict: validated,
 * one open application per email, and refused for an email that already has an account.
 * `website` is a honeypot field real people never see: a bot that fills it is quietly dropped.
 */
export async function submitApplication(
  input: unknown,
): Promise<{ reference: string }> {
  const raw = (input ?? {}) as Record<string, unknown>
  if (typeof raw.website === 'string' && raw.website.trim() !== '') {
    return { reference: 'APP-00000' } // pretend it worked; store nothing
  }
  const d = parseOrThrow(landlordApplicationSchema, input)

  // The attached documents (uploaded straight to storage before this call).
  let attached: z.infer<typeof attachedSchema> = []
  try {
    attached = attachedSchema.parse(JSON.parse(String(raw.documents ?? '[]')))
  } catch {
    throw new ServiceError(
      'Your documents could not be read. Please attach them again.',
      'validation',
    )
  }
  if (attached.length === 0) {
    throw new ServiceError(
      'Please attach your documents first.',
      'validation',
      {
        documents: ['Please attach your documents first.'],
      },
    )
  }
  checkDocumentMix(attached)
  const batchId = String(raw.batch_id ?? '')
  if (
    !isBatchId(batchId) ||
    attached.some((doc) => !isDocPathFor(doc.path, batchId, doc.type))
  ) {
    throw new ServiceError(
      'Those documents were not uploaded for this application. Please attach them again.',
      'forbidden',
    )
  }

  return withSetupHint(async () => {
    if (await usersRepo.getAccountByEmail(d.email)) {
      throw new ServiceError(
        'There is already a MyBalai account with this email. Sign in, or use a different email.',
        'conflict',
        { email: ['This email already has an account.'] },
      )
    }
    if (await repo.hasPendingFor(d.email)) {
      throw new ServiceError(
        'We already have your application and it is waiting for review. We will contact you once it is reviewed.',
        'conflict',
        {
          email: [
            'An application with this email is already waiting for review.',
          ],
        },
      )
    }
    const arrived = await Promise.all(
      attached.map((doc) => repo.objectExists(doc.path)),
    )
    if (arrived.some((ok) => !ok)) {
      throw new ServiceError(
        'A document did not finish uploading. Please attach your documents again.',
        'conflict',
        {
          documents: ['A document did not finish uploading. Please try again.'],
        },
      )
    }
    const row = await repo.insertApplication({
      full_name: d.full_name,
      email: d.email,
      phone: d.phone,
      business_name: d.business_name ?? null,
      property_name: d.property_name,
      address: d.address,
      rooms_count: d.rooms_count,
      description: d.description ?? null,
    })
    try {
      await repo.insertDocuments(
        attached.map((doc) => ({
          application_id: row.application_id,
          doc_type: doc.type,
          storage_path: doc.path,
          file_name: doc.name,
          mime_type: doc.mime,
          size_bytes: doc.size,
        })),
      )
    } catch (error) {
      await repo.deleteApplication(row.application_id) // never leave an application without its documents
      throw error
    }
    return { reference: applicationReference(row.application_id) }
  })
}

/** However many files the applicant picks, up to the limit — a permit can be several pages. */
function checkDocumentMix(docs: { type: string }[]): void {
  if (docs.length > MAX_DOCS_TOTAL) {
    throw new ServiceError(
      `Attach at most ${MAX_DOCS_TOTAL} files.`,
      'validation',
    )
  }
}

const uploadRequestSchema = z.object({
  website: z.string().optional(),
  docs: z
    .array(
      z.object({
        type: z.enum(DOC_TYPE_CODES),
        name: z.string().max(300).optional(),
        mime: z.string().max(100),
        size: z.number().int().nonnegative(),
      }),
    )
    .min(1, { error: 'Attach your documents first.' })
    .max(MAX_DOCS_TOTAL),
})

/**
 * Issue one-time upload links for an applicant's documents (no sign-in, so it is strict): the
 * server validates every file and picks every file name; nothing is readable by anyone.
 */
export async function prepareApplicationUploads(input: unknown): Promise<{
  batchId: string
  uploads: { index: number; path: string; token: string }[]
}> {
  const raw = (input ?? {}) as { website?: unknown }
  if (typeof raw.website === 'string' && raw.website.trim() !== '') {
    throw new ServiceError(
      'Something went wrong. Please try again.',
      'validation',
    )
  }
  const { docs } = parseOrThrow(uploadRequestSchema, input)
  checkDocumentMix(docs)
  for (const doc of docs) {
    const problem = validateDocFile({
      name: doc.name,
      type: doc.mime,
      size: doc.size,
    })
    if (problem) throw new ServiceError(problem, 'validation')
  }
  const batchId = randomUUID()
  return withSetupHint(async () => {
    const uploads = await Promise.all(
      docs.map(async (doc, index) => {
        const path = newDocPath(batchId, doc.type as DocTypeCode, doc.mime)
        if (!path)
          throw new ServiceError('Unsupported file type.', 'validation')
        return { index, ...(await repo.createSignedUpload(path)) }
      }),
    )
    return { batchId, uploads }
  })
}

const attachedSchema = z.array(
  z.object({
    type: z.enum(DOC_TYPE_CODES),
    path: z.string().max(300),
    name: z.string().max(300),
    mime: z.string().max(100),
    size: z.number().int().positive(),
  }),
)

/* ------------------------------------------------------------------ *
 * Superadmin — review
 * ------------------------------------------------------------------ */

export type ApplicationView = {
  applicationId: number
  reference: string
  fullName: string
  email: string
  phone: string
  businessName: string | null
  propertyName: string
  address: string
  roomsCount: number
  description: string | null
  status: repo.ApplicationStatus
  rejectReason: string | null
  reviewedAt: string | null
  landlordId: number | null
  createdAt: string
  documents: { type: string; label: string; fileName: string }[]
}

const toView = (
  r: repo.ApplicationRow,
  docs: repo.DocumentRow[] = [],
): ApplicationView => ({
  applicationId: r.application_id,
  reference: applicationReference(r.application_id),
  fullName: r.full_name,
  email: r.email,
  phone: r.phone,
  businessName: r.business_name,
  propertyName: r.property_name,
  address: r.address,
  roomsCount: r.rooms_count,
  description: r.description,
  status: r.status as repo.ApplicationStatus,
  rejectReason: r.reject_reason,
  reviewedAt: r.reviewed_at,
  landlordId: r.landlord_id,
  createdAt: r.created_at,
  documents: docs.map((d) => ({
    type: d.doc_type,
    label: docTypeLabel(d.doc_type),
    fileName: d.file_name,
  })),
})

export const APPLICATIONS_PAGE_SIZE = 20

export async function listApplications(
  status: repo.ApplicationStatus,
  page = 1,
): Promise<{
  items: ApplicationView[]
  total: number
  page: number
  pageCount: number
}> {
  await requireRole('superadmin')
  return withSetupHint(async () => {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1
    const { rows, total } = await repo.listByStatus(
      status,
      safePage,
      APPLICATIONS_PAGE_SIZE,
    )
    // documents only for the applications on THIS page (names only; the files open on demand)
    const docs = await repo.listDocumentsFor(rows.map((r) => r.application_id))
    return {
      items: rows.map((r) =>
        toView(
          r,
          docs.filter((d) => d.application_id === r.application_id),
        ),
      ),
      total,
      page: safePage,
      pageCount: Math.max(1, Math.ceil(total / APPLICATIONS_PAGE_SIZE)),
    }
  })
}

/** For the overview tile. Never fails the page. */
export async function countPendingApplications(): Promise<number> {
  await requireRole('superadmin')
  try {
    return await repo.countPending()
  } catch {
    return 0
  }
}

export { temporaryPassword }

/**
 * Approve: create the landlord account. Returns the temporary password ONCE — it is not stored;
 * the admin passes it on (the landlord can change it, or use "Forgot password").
 */
export async function approveApplication(
  id: number,
): Promise<{ email: string; password: string }> {
  const admin = await requireRole('superadmin')
  const app = await repo.getApplication(id)
  if (!app) throw new ServiceError('Application not found.', 'not_found')
  if (app.status !== 'pending')
    throw new ServiceError('This application was already reviewed.', 'conflict')

  const password = temporaryPassword()
  const { legacyUserId } = await createLandlord({
    email: app.email,
    password,
    full_name: app.full_name,
    business_name: app.business_name ?? undefined,
  })
  const ok = await repo.decide(id, {
    status: 'approved',
    reviewed_by: admin.legacyUserId,
    landlord_id: legacyUserId,
  })
  if (!ok)
    throw new ServiceError(
      'This application was reviewed by someone else at the same time.',
      'conflict',
    )

  await recordAudit({
    actor: admin,
    action: 'application.approved',
    targetType: 'application',
    targetId: id,
    summary: `Approved ${app.full_name}'s application (${applicationReference(id)}) and created their landlord account`,
    details: { landlord_id: legacyUserId },
  })
  return { email: app.email, password }
}

export async function rejectApplication(
  id: number,
  input: unknown,
): Promise<void> {
  const admin = await requireRole('superadmin')
  const d = parseOrThrow(rejectApplicationSchema, input)
  const app = await repo.getApplication(id)
  if (!app) throw new ServiceError('Application not found.', 'not_found')
  const ok = await repo.decide(id, {
    status: 'rejected',
    reviewed_by: admin.legacyUserId,
    reject_reason: d.reason,
  })
  if (!ok)
    throw new ServiceError('This application was already reviewed.', 'conflict')
  await recordAudit({
    actor: admin,
    action: 'application.rejected',
    targetType: 'application',
    targetId: id,
    summary: `Rejected ${app.full_name}'s application (${applicationReference(id)})`,
    details: { reason: d.reason },
  })
}

/** Long enough to read a permit in the preview window, short enough that a copied link is useless soon. */
export const PREVIEW_SECONDS = 600

/**
 * The temporary password is shown only once and never stored, so if the admin loses it (or the
 * applicant does) this issues a new one for the account created from an APPROVED application.
 */
export async function resetApplicantPassword(
  id: number,
): Promise<{ email: string; password: string }> {
  const admin = await requireRole('superadmin')
  const app = await repo.getApplication(id)
  if (!app) throw new ServiceError('Application not found.', 'not_found')
  if (app.status !== 'approved' || !app.landlord_id) {
    throw new ServiceError(
      'Only an approved application has an account to reset.',
      'conflict',
    )
  }
  const account = await usersRepo.getAccountById(app.landlord_id)
  if (!account?.auth_user_id)
    throw new ServiceError('That account no longer has a sign-in.', 'conflict')

  const password = temporaryPassword()
  const { error } = await createAdminClient().auth.admin.updateUserById(
    account.auth_user_id,
    { password },
  )
  if (error)
    throw new ServiceError(
      'Could not set a new password. Please try again.',
      'unknown',
    )

  await recordAudit({
    actor: admin,
    action: 'application.password_reset',
    targetType: 'application',
    targetId: id,
    summary: `Issued a new temporary password for ${app.full_name} (${applicationReference(id)})`,
  })
  return { email: app.email, password }
}

export type DocumentLink = {
  type: string
  label: string
  fileName: string
  mime: string
  url: string | null
}

/** Open an applicant's documents. Every look is recorded: these are permits and IDs. */
export async function getApplicationDocuments(
  id: number,
): Promise<DocumentLink[]> {
  const admin = await requireRole('superadmin')
  const app = await repo.getApplication(id)
  if (!app) throw new ServiceError('Application not found.', 'not_found')
  const docs = await repo.listDocumentsFor([id])
  const links = await Promise.all(
    docs.map(async (d) => ({
      type: d.doc_type,
      label: docTypeLabel(d.doc_type),
      fileName: d.file_name,
      mime: d.mime_type,
      url: await repo.signedViewUrl(d.storage_path, PREVIEW_SECONDS),
    })),
  )
  await recordAudit({
    actor: admin,
    action: 'application.documents_viewed',
    targetType: 'application',
    targetId: id,
    summary: `Viewed the documents of ${app.full_name}'s application (${applicationReference(id)})`,
  })
  return links
}
