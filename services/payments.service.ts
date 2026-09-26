import 'server-only'

import { requireRole, requireUser, type CurrentUser } from '@/lib/auth/dal'
import { recordAudit } from '@/services/audit.service'
import { primaryRole } from '@/lib/auth/roles'
import { canManageProperty, isSuperadmin } from '@/lib/permissions/properties'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as caretakersRepo from '@/repositories/caretakers.repository'
import * as paymentsRepo from '@/repositories/payments.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import {
  requireManageableProperty,
  requireOperableProperty,
} from '@/services/property-access'
import {
  attachReceiptSchema,
  createPaymentSchema,
  paymentDecisionSchema,
  paymentNoteSchema,
  paymentReplySchema,
} from '@/schemas/payment'

/* ------------------------------------------------------------------ *
 * Decoration
 * ------------------------------------------------------------------ */

export type PaymentListItem = {
  paymentId: number
  bookingId: number | null
  propertyName: string | null
  amount: number
  currency: string
  methodName: string | null
  statusCode: string | null
  statusName: string | null
  reference: string | null
  submittedAt: string
  paidAt: string | null
  payerName?: string | null
}

async function decorate(
  rows: paymentsRepo.PaymentRow[],
  options: { withPayer?: boolean } = {},
): Promise<PaymentListItem[]> {
  if (rows.length === 0) return []
  const bookingIds = rows
    .map((r) => r.booking_id)
    .filter((id): id is number => id != null)

  const [bookingRefs, methods, statuses] = await Promise.all([
    paymentsRepo.bookingRefsByIds(bookingIds),
    referenceRepo.listPaymentMethods(),
    referenceRepo.listPaymentStatuses(),
  ])

  const propNames = await bookingsRepo.propertyNamesByIds(
    [...bookingRefs.values()].map((b) => b.property_id),
  )
  const payerNames = options.withPayer
    ? await bookingsRepo.tenantNamesByIds(rows.map((r) => r.user_id))
    : new Map<number, string | null>()

  const methodName = new Map(
    methods.map((m) => [m.payment_method_id, m.method_name]),
  )
  const status = new Map(
    statuses.map((s) => [
      s.payment_status_id,
      { code: s.status_code, name: s.status_name },
    ]),
  )

  return rows.map((r) => {
    const ref = r.booking_id ? bookingRefs.get(r.booking_id) : undefined
    const st = r.payment_status_id ? status.get(r.payment_status_id) : undefined
    return {
      paymentId: r.payment_id,
      bookingId: r.booking_id,
      propertyName: ref ? (propNames.get(ref.property_id) ?? null) : null,
      amount: Number(r.amount),
      currency: r.currency,
      methodName: r.payment_method_id
        ? (methodName.get(r.payment_method_id) ?? null)
        : null,
      statusCode: st?.code ?? null,
      statusName: st?.name ?? null,
      reference: r.reference_number,
      submittedAt: r.created_at,
      paidAt: r.paid_at,
      payerName: options.withPayer
        ? (payerNames.get(r.user_id) ?? null)
        : undefined,
    }
  })
}

/* ------------------------------------------------------------------ *
 * Summaries (mobile booking / payment screens)
 * ------------------------------------------------------------------ */

export type PaymentSummary = {
  paymentId: number
  bookingId: number | null
  statusCode: string | null
  statusName: string | null
  amount: number
  currency: string
  paidAt: string | null
}

async function summarise(
  row: paymentsRepo.PaymentRow,
): Promise<PaymentSummary> {
  const statuses = await referenceRepo.listPaymentStatuses()
  const st = statuses.find((s) => s.payment_status_id === row.payment_status_id)
  return {
    paymentId: row.payment_id,
    bookingId: row.booking_id,
    statusCode: st?.status_code ?? null,
    statusName: st?.status_name ?? null,
    amount: Number(row.amount),
    currency: row.currency,
    paidAt: row.paid_at,
  }
}

/** The tenant's most recent payment for one of their bookings, or null. */
export async function latestPaymentForMyBooking(
  bookingId: number,
): Promise<PaymentSummary | null> {
  const user = await requireUser()
  const mine = (await paymentsRepo.listPaymentsByBookings([bookingId])).filter(
    (p) => p.user_id === user.legacyUserId,
  )
  // Newest first (the repository orders by created_at desc).
  return mine[0] ? summarise(mine[0]) : null
}

/** One of the caller's own payments. */
export async function getMyPaymentSummary(
  paymentId: number,
): Promise<PaymentSummary> {
  const user = await requireUser()
  const payment = await paymentsRepo.getPayment(paymentId)
  if (!payment || payment.user_id !== user.legacyUserId) {
    throw new ServiceError('Payment not found.', 'not_found')
  }
  return summarise(payment)
}

/* ------------------------------------------------------------------ *
 * Access resolution
 * ------------------------------------------------------------------ */

type PaymentAccess = {
  user: CurrentUser
  payment: paymentsRepo.PaymentRow
  propertyId: number | null
  canManage: boolean
  isPayer: boolean
}

async function resolvePaymentAccess(paymentId: number): Promise<PaymentAccess> {
  const user = await requireUser()
  const payment = await paymentsRepo.getPayment(paymentId)
  if (!payment) throw new ServiceError('Payment not found.', 'not_found')

  const isPayer = payment.user_id === user.legacyUserId
  const propertyId = payment.booking_id
    ? ((await paymentsRepo.bookingRefsByIds([payment.booking_id])).get(
        payment.booking_id,
      )?.property_id ?? null)
    : null

  if (isPayer || isSuperadmin(user)) {
    let canManage = isSuperadmin(user)
    if (!canManage && propertyId) {
      const property = await propertiesRepo.getProperty(propertyId)
      canManage = property ? canManageProperty(user, property) : false
    }
    return { user, payment, propertyId, canManage, isPayer }
  }

  if (!propertyId) throw new ServiceError('Payment not found.', 'not_found')
  const { property } = await requireOperableProperty(propertyId)
  return {
    user,
    payment,
    propertyId,
    canManage: canManageProperty(user, property),
    isPayer: false,
  }
}

/* ------------------------------------------------------------------ *
 * Tenant
 * ------------------------------------------------------------------ */

export async function getPaymentFormContext() {
  const user = await requireUser()
  const [rawBookings, methods, statuses] = await Promise.all([
    bookingsRepo.listBookingsByUser(user.legacyUserId),
    referenceRepo.listPaymentMethods(),
    referenceRepo.listBookingStatuses(),
  ])
  const statusName = new Map(
    statuses.map((s) => [s.booking_status_id, s.status_name]),
  )
  const finalCancelled = new Set(
    statuses
      .filter((s) => ['cancelled', 'rejected'].includes(s.status_code))
      .map((s) => s.booking_status_id),
  )
  const propNames = await bookingsRepo.propertyNamesByIds(
    rawBookings.map((b) => b.property_id),
  )

  return {
    bookings: rawBookings
      .filter(
        (b) =>
          b.booking_status_id == null ||
          !finalCancelled.has(b.booking_status_id),
      )
      .map((b) => ({
        bookingId: b.booking_id,
        label: `${propNames.get(b.property_id) ?? `Property #${b.property_id}`} — ${b.check_in_date} → ${b.check_out_date}`,
        statusName: b.booking_status_id
          ? (statusName.get(b.booking_status_id) ?? null)
          : null,
      })),
    methods: methods.map((m) => ({ code: m.method_code, name: m.method_name })),
  }
}

export async function createPayment(input: unknown): Promise<number> {
  const user = await requireUser()
  if (!user.roles.includes('tenant') && !isSuperadmin(user)) {
    throw new ServiceError(
      'Only a tenant account can submit a payment.',
      'forbidden',
    )
  }
  const data = parseOrThrow(createPaymentSchema, input)

  const booking = await bookingsRepo.getBooking(data.booking_id)
  if (
    !booking ||
    (booking.user_id !== user.legacyUserId && !isSuperadmin(user))
  ) {
    throw new ServiceError('Choose one of your bookings.', 'validation', {
      booking_id: ['Choose one of your bookings.'],
    })
  }

  const methodId = await paymentsRepo.resolveMethodId(data.method_code)
  if (!methodId) {
    throw new ServiceError('Unknown payment method.', 'validation', {
      method_code: ['Choose a valid payment method.'],
    })
  }

  return paymentsRepo.callCreatePayment({
    p_user: booking.user_id,
    p_created_by: user.legacyUserId,
    p_created_by_role: primaryRole(user.roles),
    p_booking: data.booking_id,
    p_amount: data.amount,
    p_method: methodId,
    p_reference: data.reference_number ?? null,
    p_paid_at: data.paid_at ? `${data.paid_at}T00:00:00Z` : null,
    p_note: data.note ?? null,
  })
}

export async function listMyPayments(): Promise<PaymentListItem[]> {
  const user = await requireUser()
  return decorate(await paymentsRepo.listPaymentsByUser(user.legacyUserId))
}

export async function cancelMyPayment(
  paymentId: number,
  note?: string,
): Promise<void> {
  const { user, payment, isPayer } = await resolvePaymentAccess(paymentId)
  if (!isPayer && !isSuperadmin(user)) {
    throw new ServiceError('Payment not found.', 'not_found')
  }
  await paymentsRepo.callSetPaymentStatus({
    p_payment: payment.payment_id,
    p_actor: user.legacyUserId,
    p_actor_role: primaryRole(user.roles),
    p_to_code: 'cancelled',
    p_note: note ?? null,
  })
}

/* ------------------------------------------------------------------ *
 * Detail (tenant or manager) + shared sub-resources
 * ------------------------------------------------------------------ */

export type PaymentDetail = PaymentListItem & {
  note: string | null
  canManage: boolean
  canDecide: boolean
  canCancel: boolean
  history: { at: string; status: string; actorRole: string | null }[]
  receipts: {
    id: number
    filename: string | null
    url: string | null
    uploadedAt: string
  }[]
  notes: {
    id: number
    author: string | null
    role: string
    note: string
    at: string
  }[]
  replies: {
    id: number
    author: string | null
    role: string
    reply: string
    at: string
  }[]
}

async function buildDetail(
  access: PaymentAccess,
  options: { withPayer: boolean },
): Promise<PaymentDetail> {
  const { payment, canManage } = access
  const [[base], history, notes, replies, receipts] = await Promise.all([
    decorate([payment], { withPayer: options.withPayer }),
    paymentsRepo.listStatusHistory(payment.payment_id),
    paymentsRepo.listNotes(payment.payment_id),
    paymentsRepo.listReplies(payment.payment_id),
    paymentsRepo.listReceipts(payment.payment_id),
  ])

  const authorIds = [
    ...notes.map((n) => n.author_id),
    ...replies.map((r) => r.author_id),
  ]
  const authorNames = await bookingsRepo.tenantNamesByIds(authorIds)

  const receiptUrls = await Promise.all(
    receipts.map((r) => paymentsRepo.signedReceiptUrl(r.storage_path)),
  )

  return {
    ...base,
    note: payment.notes,
    canManage,
    canDecide: canManage && base.statusCode === 'pending',
    canCancel:
      (access.isPayer || isSuperadmin(access.user)) &&
      base.statusCode === 'pending',
    history: history.map((h) => ({
      at: h.created_at,
      status: h.status,
      actorRole: h.status_actor_role,
    })),
    receipts: receipts.map((r, i) => ({
      id: r.payment_receipt_id,
      filename: r.original_filename,
      url: receiptUrls[i],
      uploadedAt: r.uploaded_at,
    })),
    notes: notes.map((n) => ({
      id: n.payment_note_id,
      author: authorNames.get(n.author_id) ?? null,
      role: n.author_role,
      note: n.note,
      at: n.created_at,
    })),
    replies: replies.map((r) => ({
      id: r.reply_id,
      author: authorNames.get(r.author_id) ?? null,
      role: r.author_role,
      reply: r.reply,
      at: r.created_at,
    })),
  }
}

export async function getMyPayment(paymentId: number): Promise<PaymentDetail> {
  const access = await resolvePaymentAccess(paymentId)
  if (!access.isPayer && !isSuperadmin(access.user)) {
    throw new ServiceError('Payment not found.', 'not_found')
  }
  return buildDetail(access, { withPayer: false })
}

export async function getManagedPayment(
  paymentId: number,
): Promise<PaymentDetail> {
  const access = await resolvePaymentAccess(paymentId)
  return buildDetail(access, { withPayer: true })
}

export async function addNote(
  paymentId: number,
  input: unknown,
): Promise<void> {
  const access = await resolvePaymentAccess(paymentId)
  const { note } = parseOrThrow(paymentNoteSchema, input)
  await paymentsRepo.insertNote({
    payment_id: paymentId,
    author_id: access.user.legacyUserId,
    author_role: primaryRole(access.user.roles),
    note,
  })
}

export async function addReply(
  paymentId: number,
  input: unknown,
): Promise<void> {
  const access = await resolvePaymentAccess(paymentId)
  const { reply } = parseOrThrow(paymentReplySchema, input)
  await paymentsRepo.insertReply({
    payment_id: paymentId,
    author_id: access.user.legacyUserId,
    author_role: primaryRole(access.user.roles),
    reply,
  })
}

export async function attachReceipt(
  paymentId: number,
  input: unknown,
): Promise<void> {
  const access = await resolvePaymentAccess(paymentId)
  const data = parseOrThrow(attachReceiptSchema, input)
  if (!data.storage_path.startsWith(`${paymentId}/`)) {
    throw new ServiceError('Invalid receipt path.', 'validation')
  }
  await paymentsRepo.insertReceipt({
    payment_id: paymentId,
    storage_path: data.storage_path,
    original_filename: data.original_filename ?? null,
    mime_type: data.mime_type ?? null,
    file_size: data.file_size ?? null,
    uploaded_by: access.user.legacyUserId,
  })
}

/* ------------------------------------------------------------------ *
 * Manager
 * ------------------------------------------------------------------ */

async function managerScope(
  user: CurrentUser,
  area: 'landlord' | 'caretaker',
): Promise<bookingsRepo.ManagerScope> {
  if (isSuperadmin(user)) return { kind: 'all' }
  if (area === 'caretaker') {
    return {
      kind: 'properties',
      propertyIds: await caretakersRepo.listAssignedPropertyIds(
        user.legacyUserId,
        {
          activeOnly: true,
        },
      ),
    }
  }
  return { kind: 'owner', ownerId: user.legacyUserId }
}

export async function listManagedPayments(
  area: 'landlord' | 'caretaker',
  statusCode?: string,
): Promise<PaymentListItem[]> {
  const user = await requireUser()
  const scope = await managerScope(user, area)

  let statusId: number | undefined
  if (statusCode) {
    const statuses = await referenceRepo.listPaymentStatuses()
    statusId = statuses.find(
      (s) => s.status_code === statusCode,
    )?.payment_status_id
  }

  return decorate(
    await paymentsRepo.listPaymentsForManager(scope, { statusId }),
    {
      withPayer: true,
    },
  )
}

export async function decidePayment(
  paymentId: number,
  input: unknown,
): Promise<void> {
  const user = await requireUser()
  const payment = await paymentsRepo.getPayment(paymentId)
  if (!payment || !payment.booking_id) {
    throw new ServiceError('Payment not found.', 'not_found')
  }
  const ref = await paymentsRepo.bookingRefsByIds([payment.booking_id])
  const propertyId = ref.get(payment.booking_id)?.property_id
  if (!propertyId) throw new ServiceError('Payment not found.', 'not_found')

  // Verify / reject is owner or superadmin only (spec §27).
  await requireManageableProperty(propertyId)

  const { to, note } = parseOrThrow(paymentDecisionSchema, input)
  await paymentsRepo.callSetPaymentStatus({
    p_payment: paymentId,
    p_actor: user.legacyUserId,
    p_actor_role: primaryRole(user.roles),
    p_to_code: to,
    p_note: note ?? null,
  })
  if (user.roles.includes('superadmin')) {
    await recordAudit({
      actor: user,
      action: 'payment.decided',
      targetType: 'payment',
      targetId: paymentId,
      summary: `Set payment #${paymentId} to ${to}`,
      details: { to },
    })
  }
}

/* ------------------------------------------------------------------ *
 * Refunds (superadmin)
 * ------------------------------------------------------------------ */

const REFUND_PROBLEMS: Record<string, string> = {
  not_found: 'Payment not found.',
  not_paid: 'Only a paid payment can be refunded.',
  already_refunded: 'This payment was already refunded.',
}

/**
 * Record that a paid payment was refunded. This does NOT move money: refund the tenant in the
 * PayMongo dashboard (PayMongo then tells us by webhook and this is done for you), or do it by
 * hand and record it here. The landlord's earning is reversed; if it was already withdrawn, the
 * amount is taken off their next withdrawal.
 */
export async function refundPayment(
  paymentId: number,
  input: { note?: string },
): Promise<void> {
  const actor = await requireRole('superadmin')
  const note = (input.note ?? '').trim().slice(0, 2000) || null
  const result = await paymentsRepo.callRefundPayment({
    p_payment: paymentId,
    p_actor: actor.legacyUserId,
    p_note: note,
  })
  if (result !== 'refunded') {
    throw new ServiceError(
      REFUND_PROBLEMS[result] ?? 'The refund could not be recorded.',
      result === 'not_found' ? 'not_found' : 'conflict',
    )
  }
  await recordAudit({
    actor,
    action: 'payment.refunded',
    targetType: 'payment',
    targetId: paymentId,
    summary: `Recorded a refund for payment #${paymentId}`,
    details: { note },
  })
}
