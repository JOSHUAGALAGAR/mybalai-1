import 'server-only'

import {
  invalidateCurrentUser,
  requireRole,
  requireUser,
  type CurrentUser,
} from '@/lib/auth/dal'
import {
  idTypeLabel,
  isIdPathFor,
  MAX_ID_BYTES,
  newIdPath,
  validateUploadFile,
} from '@/lib/identity/rules'
import * as messagingRepo from '@/repositories/messaging.repository'
import * as usersRepo from '@/repositories/users.repository'
import * as repo from '@/repositories/verification.repository'
import {
  decisionSchema,
  idSubmitSchema,
  idUploadRequestSchema,
} from '@/schemas/verification'
import { ServiceError, parseOrThrow } from '@/services/errors'

/**
 * Tenant ID verification. The tenant uploads the FRONT and BACK of a government ID; a superadmin
 * approves or rejects it. The pictures live in a PRIVATE bucket: only this service can read them,
 * and only a superadmin is ever handed a link (which expires after a minute).
 */

async function requireTenant(): Promise<CurrentUser> {
  const user = await requireUser()
  if (!user.roles.includes('tenant')) {
    throw new ServiceError(
      'Only tenant accounts can verify an ID.',
      'forbidden',
    )
  }
  return user
}

/* ------------------------------------------------------------------ *
 * Tenant
 * ------------------------------------------------------------------ */

export type MyVerification = {
  /** `none` = never submitted. */
  status: 'none' | 'pending' | 'approved' | 'rejected'
  verified: boolean
  idType: string | null
  idTypeLabel: string | null
  submittedAt: string | null
  reviewedAt: string | null
  /** Why it was rejected (only when `status` is `rejected`). */
  rejectReason: string | null
}

export async function getMyVerification(): Promise<MyVerification> {
  const user = await requireTenant()
  const [row, verifiedAt] = await Promise.all([
    repo.latestForUser(user.legacyUserId),
    repo.getIdVerifiedAt(user.legacyUserId),
  ])
  return {
    status: row ? (row.status as MyVerification['status']) : 'none',
    verified: verifiedAt !== null,
    idType: row?.id_type ?? null,
    idTypeLabel: row ? idTypeLabel(row.id_type) : null,
    submittedAt: row?.submitted_at ?? null,
    reviewedAt: row?.reviewed_at ?? null,
    rejectReason: row?.status === 'rejected' ? row.reject_reason : null,
  }
}

/** Is this tenant verified? Cheap and safe to call on every /me (never throws). */
export async function isIdVerified(userId: number): Promise<boolean> {
  return (await repo.getIdVerifiedAt(userId)) !== null
}

async function assertCanSubmit(userId: number): Promise<void> {
  const latest = await repo.latestForUser(userId)
  if (latest?.status === 'pending') {
    throw new ServiceError('Your ID is already being reviewed.', 'conflict')
  }
  if (latest?.status === 'approved') {
    throw new ServiceError('Your ID is already verified.', 'conflict')
  }
}

/** Validate the two pictures and issue one upload link for each. */
export async function prepareIdUpload(input: unknown): Promise<{
  front: { path: string; token: string }
  back: { path: string; token: string }
}> {
  const user = await requireTenant()
  const data = parseOrThrow(idUploadRequestSchema, input)
  await assertCanSubmit(user.legacyUserId)

  for (const [side, file] of [
    ['front', data.front],
    ['back', data.back],
  ] as const) {
    const problem = validateUploadFile(file, MAX_ID_BYTES)
    if (problem) {
      throw new ServiceError(`The ${side} photo: ${problem}`, 'validation', {
        [side]: [problem],
      })
    }
  }

  const frontPath = newIdPath(user.legacyUserId, 'front', data.front.type)
  const backPath = newIdPath(user.legacyUserId, 'back', data.back.type)
  if (!frontPath || !backPath) {
    throw new ServiceError('Unsupported image type.', 'validation')
  }
  const [front, back] = await Promise.all([
    repo.createSignedUpload(frontPath),
    repo.createSignedUpload(backPath),
  ])
  return { front, back }
}

/** The pictures arrived: put the submission in the admin's queue. */
export async function submitVerification(
  input: unknown,
): Promise<MyVerification> {
  const user = await requireTenant()
  const data = parseOrThrow(idSubmitSchema, input)

  if (
    !isIdPathFor(data.frontPath, user.legacyUserId, 'front') ||
    !isIdPathFor(data.backPath, user.legacyUserId, 'back')
  ) {
    throw new ServiceError(
      'Those photos were not uploaded for your account.',
      'forbidden',
    )
  }
  await assertCanSubmit(user.legacyUserId)

  const [frontOk, backOk] = await Promise.all([
    repo.objectExists(data.frontPath),
    repo.objectExists(data.backPath),
  ])
  if (!frontOk || !backOk) {
    await repo.removeObjects([data.frontPath, data.backPath]).catch(() => {})
    throw new ServiceError(
      'The photos did not finish uploading. Please try again.',
      'conflict',
    )
  }

  try {
    await repo.insertPending({
      user_id: user.legacyUserId,
      id_type: data.idType,
      front_path: data.frontPath,
      back_path: data.backPath,
    })
  } catch (error) {
    await repo.removeObjects([data.frontPath, data.backPath]).catch(() => {})
    const code = (error as { cause?: { code?: string } })?.cause?.code
    if (code === '23505') {
      throw new ServiceError('Your ID is already being reviewed.', 'conflict')
    }
    throw error
  }
  return getMyVerification()
}

/* ------------------------------------------------------------------ *
 * Superadmin review
 * ------------------------------------------------------------------ */

export type AdminVerificationItem = {
  verificationId: number
  userId: number
  name: string
  email: string | null
  idType: string
  idTypeLabel: string
  status: repo.VerificationStatus
  submittedAt: string
  reviewedAt: string | null
}

export async function listVerificationsForAdmin(
  status: repo.VerificationStatus,
): Promise<AdminVerificationItem[]> {
  await requireRole('superadmin')
  const rows = await repo.listByStatus(status)
  const names = await repo.accountNames(rows.map((r) => r.user_id))
  return rows.map((r) => {
    const account = names.get(r.user_id)
    return {
      verificationId: r.verification_id,
      userId: r.user_id,
      name: account?.fullName || account?.email || `User #${r.user_id}`,
      email: account?.email ?? null,
      idType: r.id_type,
      idTypeLabel: idTypeLabel(r.id_type),
      status: r.status as repo.VerificationStatus,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
    }
  })
}

export async function countPendingVerifications(): Promise<number> {
  await requireRole('superadmin')
  return repo.countByStatus('pending').catch(() => 0)
}

export type AdminVerificationDetail = AdminVerificationItem & {
  phone: string | null
  rejectReason: string | null
  /** Links to the two pictures. They stop working after about a minute — reload the page for fresh ones. */
  frontUrl: string | null
  backUrl: string | null
}

export async function getVerificationForAdmin(
  id: number,
): Promise<AdminVerificationDetail> {
  await requireRole('superadmin')
  const row = await repo.getById(id)
  if (!row) throw new ServiceError('Verification not found.', 'not_found')
  const [names, frontUrl, backUrl] = await Promise.all([
    repo.accountNames([row.user_id]),
    repo.signedViewUrl(row.front_path),
    repo.signedViewUrl(row.back_path),
  ])
  const account = names.get(row.user_id)
  return {
    verificationId: row.verification_id,
    userId: row.user_id,
    name: account?.fullName || account?.email || `User #${row.user_id}`,
    email: account?.email ?? null,
    phone: account?.phone ?? null,
    idType: row.id_type,
    idTypeLabel: idTypeLabel(row.id_type),
    status: row.status as repo.VerificationStatus,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    rejectReason: row.reject_reason,
    frontUrl,
    backUrl,
  }
}

export async function decideVerification(
  id: number,
  input: unknown,
): Promise<void> {
  const admin = await requireRole('superadmin')
  const data = parseOrThrow(decisionSchema, input)

  const row = await repo.getById(id)
  if (!row) throw new ServiceError('Verification not found.', 'not_found')
  if (row.status !== 'pending') {
    throw new ServiceError('This ID was already reviewed.', 'conflict')
  }
  const approve = data.decision === 'approve'

  const updated = await repo.decide(id, {
    status: approve ? 'approved' : 'rejected',
    reviewedBy: admin.legacyUserId,
    reason: approve ? null : (data.reason ?? null),
  })
  // Two admins clicking at once: the second one loses cleanly.
  if (!updated)
    throw new ServiceError('This ID was already reviewed.', 'conflict')

  if (approve) await repo.setIdVerifiedAt(row.user_id, updated.reviewed_at)

  // Tell the tenant. A failed notification must not undo the decision.
  await messagingRepo
    .notify({
      user_id: row.user_id,
      notification_type: 'VERIFICATION',
      title: approve ? 'ID verified' : 'ID verification needs attention',
      message: approve
        ? 'Your ID was verified. A Verified badge now shows on your account.'
        : `Your ID could not be verified: ${data.reason}. You can upload it again.`,
      reference_type: 'verification',
      reference_id: id,
    })
    .catch((error) => console.error('[verification] notify failed:', error))

  const account = await usersRepo.getAccountById(row.user_id).catch(() => null)
  if (account?.auth_user_id) invalidateCurrentUser(account.auth_user_id)
}
