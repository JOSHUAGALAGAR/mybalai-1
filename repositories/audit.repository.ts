import 'server-only'

import { describeLegacyAudit } from '@/lib/audit/actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

/**
 * `audit_logs` predates the admin console: it has entity_type / entity_id / metadata columns and
 * some rows are written by the database itself (e.g. "payment_created"). App-written rows keep
 * their readable description and the actor's name in `metadata`.
 */
type Row = Tables<'audit_logs'>

/** One log line, however it was written. */
export type AuditEntry = {
  id: number
  actorId: number | null
  actorName: string | null
  /** True for rows the database wrote by itself (no person behind them). */
  system: boolean
  action: string
  summary: string
  createdAt: string
}

export type NewAudit = {
  actorId: number | null
  actorName: string | null
  action: string
  targetType: string | null
  /** Numeric ids go to entity_id; anything else (e.g. a report name) is kept in metadata. */
  targetId: string | null
  summary: string
  details: Record<string, unknown>
}

const db = () => createAdminClient()

export async function insertAudit(entry: NewAudit): Promise<void> {
  const numeric = entry.targetId !== null && /^\d{1,15}$/.test(entry.targetId)
  const { error } = await db()
    .from('audit_logs')
    .insert({
      actor_id: entry.actorId,
      action: entry.action,
      entity_type: entry.targetType,
      entity_id: numeric ? Number(entry.targetId) : null,
      metadata: {
        ...entry.details,
        summary: entry.summary,
        actor_name: entry.actorName,
        ...(entry.targetId !== null && !numeric
          ? { target: entry.targetId }
          : {}),
      },
    })
  if (error) throw new RepositoryError('Failed to write the audit log.', error)
}

export type AuditFilter = {
  action?: string
  /** Matches the start of the action code, e.g. "verification." */
  actionPrefix?: string
  actorId?: number
  from?: string
  to?: string
  q?: string
}

async function toEntries(rows: Row[]): Promise<AuditEntry[]> {
  // Rows written by the database carry only actor_id: look the names up.
  const needNames = [
    ...new Set(
      rows
        .filter((r) => r.actor_id !== null && !meta(r).actor_name)
        .map((r) => r.actor_id as number),
    ),
  ]
  const names = new Map<number, string>()
  if (needNames.length > 0) {
    const { data } = await db()
      .from('user_accounts')
      .select('legacy_user_id, full_name, email')
      .in('legacy_user_id', needNames)
    for (const a of data ?? []) {
      const name = a.full_name || a.email
      if (name) names.set(a.legacy_user_id, name)
    }
  }
  return rows.map((r) => {
    const m = meta(r)
    const summary = typeof m.summary === 'string' ? m.summary : null
    return {
      id: r.audit_log_id,
      actorId: r.actor_id,
      actorName:
        (typeof m.actor_name === 'string' && m.actor_name) ||
        (r.actor_id !== null ? (names.get(r.actor_id) ?? null) : null),
      system: r.actor_id === null && summary === null,
      action: r.action,
      summary:
        summary ?? describeLegacyAudit(r.action, r.entity_type, r.entity_id),
      createdAt: r.created_at,
    }
  })
}

const meta = (r: Row): Record<string, unknown> =>
  r.metadata && typeof r.metadata === 'object' ? r.metadata : {}

export async function listAudit(
  filter: AuditFilter,
  page: number,
  pageSize: number,
): Promise<{ rows: AuditEntry[]; total: number }> {
  let query = db()
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('audit_log_id', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (filter.action) query = query.eq('action', filter.action)
  if (filter.actionPrefix)
    query = query.like('action', `${filter.actionPrefix}%`)
  if (filter.actorId) query = query.eq('actor_id', filter.actorId)
  if (filter.from) query = query.gte('created_at', filter.from)
  if (filter.to) query = query.lte('created_at', filter.to)
  if (filter.q) {
    // drop the characters that mean something inside a PostgREST `or` filter
    const safe = filter.q.replace(/[%,()*\\:"]/g, ' ').trim()
    if (safe) {
      query = query.or(
        `metadata->>summary.ilike.%${safe}%,metadata->>actor_name.ilike.%${safe}%,action.ilike.%${safe}%`,
      )
    }
  }
  const { data, error, count } = await query
  if (error) throw new RepositoryError('Failed to load the audit log.', error)
  return { rows: await toEntries((data ?? []) as Row[]), total: count ?? 0 }
}

export async function listRecentAudit(limit: number): Promise<AuditEntry[]> {
  const { data, error } = await db()
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .order('audit_log_id', { ascending: false })
    .limit(limit)
  if (error) throw new RepositoryError('Failed to load recent activity.', error)
  return toEntries((data ?? []) as Row[])
}
