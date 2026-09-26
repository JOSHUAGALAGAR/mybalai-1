import 'server-only'

import { requireRole } from '@/lib/auth/dal'
import { cleanDetails, type AuditAction } from '@/lib/audit/actions'
import * as repo from '@/repositories/audit.repository'
import { ServiceError } from '@/services/errors'

/**
 * Record a privileged action. NEVER throws: an audit hiccup (or the table not existing yet) must
 * not block the action itself — it is logged to the server console instead.
 */
export async function recordAudit(entry: {
  actor: {
    legacyUserId: number
    fullName?: string | null
    email?: string | null
  } | null
  action: AuditAction
  targetType?: string
  targetId?: string | number
  summary: string
  details?: Record<string, unknown>
}): Promise<void> {
  try {
    await repo.insertAudit({
      actorId: entry.actor?.legacyUserId ?? null,
      actorName: entry.actor?.fullName || entry.actor?.email || null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId === undefined ? null : String(entry.targetId),
      summary: entry.summary.slice(0, 500),
      details: cleanDetails(entry.details),
    })
  } catch (error) {
    console.error('[audit] could not record', entry.action, error)
  }
}

export const AUDIT_PAGE_SIZE = 25

export async function listAuditLog(input: {
  page?: number
  action?: string
  group?: string
  actorId?: number
  from?: string
  to?: string
  q?: string
}) {
  await requireRole('superadmin')
  const page = Number.isInteger(input.page) && input.page! > 0 ? input.page! : 1
  const result = await repo.listAudit(
    {
      action: input.action,
      actionPrefix: input.group,
      actorId: input.actorId,
      from: input.from,
      to: input.to,
      q: input.q,
    },
    page,
    AUDIT_PAGE_SIZE,
  )
  return {
    ...result,
    page,
    pageSize: AUDIT_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(result.total / AUDIT_PAGE_SIZE)),
  }
}

export async function recentActivity(limit = 8) {
  await requireRole('superadmin')
  try {
    return await repo.listRecentAudit(limit)
  } catch {
    return []
  }
}

export { ServiceError }
