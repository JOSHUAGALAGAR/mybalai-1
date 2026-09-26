import 'server-only'

import { requireRole } from '@/lib/auth/dal'
import { isPayoutSetupProblem, PAYOUT_SETUP_MESSAGE } from '@/lib/db-errors'
import {
  feeBreakdown,
  isWithdrawalDay,
  maskAccountNumber,
  nextWithdrawalDate,
  round2,
  withdrawalBlocker,
  withdrawalMethodLabel,
} from '@/lib/payouts/rules'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as messagingRepo from '@/repositories/messaging.repository'
import * as repo from '@/repositories/payouts.repository'
import * as usersRepo from '@/repositories/users.repository'
import {
  completePayoutSchema,
  failPayoutSchema,
  payoutSettingsSchema,
  withdrawalMethodSchema,
} from '@/schemas/payouts'
import { recordAudit } from '@/services/audit.service'
import { ServiceError, parseOrThrow } from '@/services/errors'

/** Turn "the migration is missing" into a message a person can act on. */
async function withSetupHint<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (isPayoutSetupProblem(error))
      throw new ServiceError(PAYOUT_SETUP_MESSAGE, 'conflict')
    throw error
  }
}

/* ------------------------------------------------------------------ *
 * The rules (what the superadmin set)
 * ------------------------------------------------------------------ */

export type PayoutRules = {
  paymongoFeePct: number
  platformFeePct: number
  withdrawalDay: number
  minimumThreshold: number
  holdDays: number
}

const DEFAULTS: PayoutRules = {
  paymongoFeePct: 1.5,
  platformFeePct: 1.5,
  withdrawalDay: 30,
  minimumThreshold: 1000,
  holdDays: 3,
}

async function loadRules(): Promise<PayoutRules> {
  const [fees, payout] = await Promise.all([
    repo.getFeeSettings(),
    repo.getPayoutSettings(),
  ])
  return {
    paymongoFeePct: fees
      ? Number(fees.paymongo_fee_rate ?? DEFAULTS.paymongoFeePct)
      : DEFAULTS.paymongoFeePct,
    platformFeePct: fees ? Number(fees.fee_value) : DEFAULTS.platformFeePct,
    withdrawalDay: payout?.payout_day_1 ?? DEFAULTS.withdrawalDay,
    minimumThreshold: payout
      ? Number(payout.minimum_threshold)
      : DEFAULTS.minimumThreshold,
    holdDays: payout?.settlement_period_days ?? DEFAULTS.holdDays,
  }
}

export async function getPayoutRulesForAdmin(): Promise<PayoutRules> {
  await requireRole('superadmin')
  return withSetupHint(loadRules)
}

export async function updatePayoutSettings(
  input: unknown,
): Promise<PayoutRules> {
  const actor = await requireRole('superadmin')
  const d = parseOrThrow(payoutSettingsSchema, input)
  return withSetupHint(async () => {
    const [fees, payout] = await Promise.all([
      repo.getFeeSettings(),
      repo.getPayoutSettings(),
    ])
    await repo.saveFeeSettings(fees, {
      fee_value: d.platform_fee_rate,
      paymongo_fee_rate: d.paymongo_fee_rate,
      updated_by: actor.legacyUserId,
    })
    await repo.savePayoutSettings(payout, {
      payout_day_1: d.withdrawal_day,
      minimum_threshold: d.minimum_threshold,
      settlement_period_days: d.hold_days,
      updated_by: actor.legacyUserId,
    })
    await recordAudit({
      actor,
      action: 'payout.settings_changed',
      targetType: 'payout_settings',
      summary: `Set PayMongo fee ${d.paymongo_fee_rate}%, MyBalai fee ${d.platform_fee_rate}%, withdrawals on day ${d.withdrawal_day}, minimum ₱${d.minimum_threshold}, hold ${d.hold_days} days`,
      details: { ...d },
    })
    return loadRules()
  })
}

/* ------------------------------------------------------------------ *
 * Landlord — earnings and withdrawals
 * ------------------------------------------------------------------ */

export type EarningView = {
  earningId: number
  bookingId: number | null
  propertyName: string | null
  paidAt: string
  /** What the landlord actually gets, and the two deductions that explain it. */
  net: number
  paymongoFee: number
  paymongoPct: number
  platformFee: number
  platformPct: number
  status: 'pending' | 'in_payout' | 'paid_out' | 'reversed'
  /** The tenant was refunded: the earning is void (or, if already withdrawn, taken back from the next withdrawal). */
  refunded: boolean
  /** When the money can be withdrawn (after the hold). */
  availableAt: string | null
  /** True once the hold has passed and it is not yet part of a withdrawal. */
  withdrawable: boolean
}

export type PayoutView = {
  payoutId: number
  reference: string
  amount: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  requestedAt: string
  completedAt: string | null
  failureReason: string | null
  methodLabel: string | null
}

export type MyEarnings = {
  rules: PayoutRules
  /** Ready to withdraw now (hold passed, not already requested). */
  available: number
  /** Earned, still inside the hold. */
  onHold: number
  /** Refunds of money already withdrawn, taken off the next withdrawal. */
  clawback: number
  /** In a withdrawal that is being processed. */
  processing: number
  withdrawn: number
  nextWithdrawalDate: string
  isWithdrawalDay: boolean
  /** Why they cannot withdraw right now; null = they can. */
  blocker: string | null
  method: { label: string; accountName: string; masked: string } | null
  earnings: EarningView[]
  payouts: PayoutView[]
}

const pctOf = (fee: number, gross: number) =>
  gross > 0 ? round2((fee / gross) * 100) : 0

export async function getMyEarnings(now = new Date()): Promise<MyEarnings> {
  const user = await requireRole('landlord', 'superadmin')
  return withSetupHint(async () => {
    const [rules, rows, method, payouts] = await Promise.all([
      loadRules(),
      repo.listEarnings(user.legacyUserId),
      repo.getActiveMethod(user.legacyUserId),
      repo.listPayoutsByLandlord(user.legacyUserId),
    ])
    const bookingIds = rows
      .map((r) => r.booking_id)
      .filter((id): id is number => id != null)
    const propertyByBooking = new Map<number, string>()
    if (bookingIds.length > 0) {
      const bookings = await Promise.all(
        [...new Set(bookingIds)].map((id) => bookingsRepo.getBooking(id)),
      )
      const names = await bookingsRepo.propertyNamesByIds(
        bookings.filter((b) => b != null).map((b) => b!.property_id),
      )
      for (const b of bookings)
        if (b)
          propertyByBooking.set(b.booking_id, names.get(b.property_id) ?? '')
    }

    const methodById = new Map<number, string>()
    for (const p of payouts) {
      if (p.withdrawal_method_id && !methodById.has(p.withdrawal_method_id)) {
        const m = await repo.getMethod(p.withdrawal_method_id)
        if (m)
          methodById.set(
            p.withdrawal_method_id,
            withdrawalMethodLabel(m.method_type),
          )
      }
    }

    const isReady = (r: repo.EarningRow) =>
      r.status === 'pending' &&
      r.payout_id === null &&
      (!r.available_at || new Date(r.available_at) <= now)

    const earnings: EarningView[] = rows.map((r) => ({
      earningId: r.earning_id,
      bookingId: r.booking_id,
      propertyName: r.booking_id
        ? propertyByBooking.get(r.booking_id) || null
        : null,
      paidAt: r.created_at,
      net: Number(r.net_amount),
      paymongoFee: Number(r.processing_fee_amount),
      paymongoPct: pctOf(
        Number(r.processing_fee_amount),
        Number(r.gross_amount),
      ),
      platformFee: Number(r.service_fee_amount),
      platformPct: pctOf(Number(r.service_fee_amount), Number(r.gross_amount)),
      status: r.status as EarningView['status'],
      refunded: Boolean(r.refunded_at),
      availableAt: r.available_at,
      withdrawable: isReady(r),
    }))

    const sum = (list: repo.EarningRow[]) =>
      round2(list.reduce((n, r) => n + Number(r.net_amount), 0))
    const clawback = round2(
      rows
        .filter(
          (r) =>
            Number(r.adjustment_amount) < 0 &&
            (r.status === 'in_payout' || r.status === 'paid_out') &&
            !r.clawback_settled_at,
        )
        .reduce((n, r) => n - Number(r.adjustment_amount), 0),
    )
    const ready = sum(rows.filter(isReady))
    // what they can actually withdraw: ready earnings minus refunds of money already paid out
    const available = Math.max(round2(ready - clawback), 0)
    const onHold = sum(
      rows.filter((r) => r.status === 'pending' && !isReady(r)),
    )
    const processing = sum(rows.filter((r) => r.status === 'in_payout'))
    const withdrawn = sum(
      rows.filter((r) => r.status === 'paid_out' && !r.refunded_at),
    )
    const hasOpenPayout = payouts.some(
      (p) => p.status === 'pending' || p.status === 'processing',
    )

    return {
      rules,
      available,
      onHold,
      clawback,
      processing,
      withdrawn,
      nextWithdrawalDate: nextWithdrawalDate(now, rules.withdrawalDay),
      isWithdrawalDay: isWithdrawalDay(now, rules.withdrawalDay),
      blocker: withdrawalBlocker({
        now,
        day: rules.withdrawalDay,
        available,
        threshold: rules.minimumThreshold,
        hasMethod: method !== null,
        hasOpenPayout,
      }),
      method: method
        ? {
            label: withdrawalMethodLabel(method.method_type),
            accountName: method.account_name,
            masked: method.masked_account_number,
          }
        : null,
      earnings,
      payouts: payouts.map((p) => ({
        payoutId: p.payout_id,
        reference: p.reference,
        amount: Number(p.amount),
        status: p.status as PayoutView['status'],
        requestedAt: p.requested_at,
        completedAt: p.completed_at,
        failureReason: p.failure_reason,
        methodLabel: p.withdrawal_method_id
          ? (methodById.get(p.withdrawal_method_id) ?? null)
          : null,
      })),
    }
  })
}

export async function saveWithdrawalMethod(input: unknown): Promise<void> {
  const user = await requireRole('landlord', 'superadmin')
  const d = parseOrThrow(withdrawalMethodSchema, input)
  const bank = d.method_type === 'bank' ? d.bank_name : undefined
  if (d.method_type === 'bank' && !bank) {
    throw new ServiceError('Enter the bank’s name.', 'validation', {
      bank_name: ['Enter the bank’s name.'],
    })
  }
  await withSetupHint(() =>
    repo.replaceMethod(user.legacyUserId, {
      method_type: d.method_type,
      account_name: d.account_name,
      // the full number is what the admin needs to send the money; the masked form is what is displayed
      masked_account_number: `${bank ? `${bank} ` : ''}${maskAccountNumber(d.account_number)}`,
      provider_reference: d.account_number.replace(/[\s-]/g, ''),
    }),
  )
}

/**
 * Ask for all withdrawable earnings. Allowed only on the withdrawal day, above the minimum,
 * with a place to send the money, and one open request at a time.
 */
export async function requestWithdrawal(
  now = new Date(),
): Promise<{ payoutId: number }> {
  const user = await requireRole('landlord', 'superadmin')
  const earnings = await getMyEarnings(now)
  if (earnings.blocker) throw new ServiceError(earnings.blocker, 'conflict')

  const method = await repo.getActiveMethod(user.legacyUserId)
  if (!method)
    throw new ServiceError(
      'Add where the money should be sent first.',
      'conflict',
    )

  try {
    const payoutId = await repo.callRequestPayout(
      user.legacyUserId,
      method.withdrawal_method_id,
    )
    return { payoutId }
  } catch (error) {
    const text = error instanceof Error ? error.message : ''
    if (/payout_open/.test(text)) {
      throw new ServiceError(
        'Your last withdrawal is still being processed.',
        'conflict',
      )
    }
    if (/below_threshold/.test(text)) {
      throw new ServiceError(
        'There is not enough ready to withdraw yet.',
        'conflict',
      )
    }
    if (isPayoutSetupProblem(error))
      throw new ServiceError(PAYOUT_SETUP_MESSAGE, 'conflict')
    throw error
  }
}

/* ------------------------------------------------------------------ *
 * Superadmin — withdrawal requests
 * ------------------------------------------------------------------ */

export type AdminPayoutView = PayoutView & {
  landlordId: number
  landlordName: string
  landlordEmail: string | null
  /** Where to send the money — the full number, visible only here. */
  sendTo: {
    label: string
    accountName: string
    accountNumber: string
    display: string
  } | null
}

export async function listPayoutsForAdmin(
  status?: string,
): Promise<AdminPayoutView[]> {
  await requireRole('superadmin')
  return withSetupHint(async () => {
    const rows = await repo.listPayouts(status)
    const accounts = await usersRepo.listAccountsByIds(
      rows.map((r) => r.landlord_id),
    )
    const names = new Map(accounts.map((a) => [a.legacy_user_id, a]))
    const methods = new Map<number, repo.MethodRow>()
    for (const r of rows) {
      if (r.withdrawal_method_id && !methods.has(r.withdrawal_method_id)) {
        const m = await repo.getMethod(r.withdrawal_method_id)
        if (m) methods.set(r.withdrawal_method_id, m)
      }
    }
    return rows.map((p) => {
      const account = names.get(p.landlord_id)
      const m = p.withdrawal_method_id
        ? methods.get(p.withdrawal_method_id)
        : undefined
      return {
        payoutId: p.payout_id,
        reference: p.reference,
        amount: Number(p.amount),
        status: p.status as PayoutView['status'],
        requestedAt: p.requested_at,
        completedAt: p.completed_at,
        failureReason: p.failure_reason,
        methodLabel: m ? withdrawalMethodLabel(m.method_type) : null,
        landlordId: p.landlord_id,
        landlordName:
          account?.full_name || account?.email || `Landlord #${p.landlord_id}`,
        landlordEmail: account?.email ?? null,
        sendTo: m
          ? {
              label: withdrawalMethodLabel(m.method_type),
              accountName: m.account_name,
              accountNumber: m.provider_reference ?? '',
              display: m.masked_account_number,
            }
          : null,
      }
    })
  })
}

async function tellLandlord(
  landlordId: number,
  payoutId: number,
  title: string,
  message: string,
) {
  await messagingRepo
    .notify({
      user_id: landlordId,
      notification_type: 'PAYMENT',
      title,
      message,
      reference_type: 'payout',
      reference_id: payoutId,
    })
    .catch((error) => console.error('[payouts] notify failed:', error))
}

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

/** The money was sent: record the transfer reference. */
export async function completePayout(
  payoutId: number,
  input: unknown,
): Promise<void> {
  const actor = await requireRole('superadmin')
  const d = parseOrThrow(completePayoutSchema, input)
  const payout = await repo.getPayout(payoutId)
  if (!payout) throw new ServiceError('Withdrawal not found.', 'not_found')
  const ok = await repo.decidePayout(payoutId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    provider: 'manual',
    provider_payout_id: d.reference,
  })
  if (!ok)
    throw new ServiceError('This withdrawal was already handled.', 'conflict')
  await repo.markEarningsPaidOut(payoutId)
  await recordAudit({
    actor,
    action: 'payout.completed',
    targetType: 'payout',
    targetId: payoutId,
    summary: `Marked withdrawal ${payout.reference} (${peso(Number(payout.amount))}) as paid`,
    details: { reference: d.reference },
  })
  await tellLandlord(
    payout.landlord_id,
    payoutId,
    'Withdrawal sent',
    `${peso(Number(payout.amount))} was sent to your account. Transfer reference: ${d.reference}.`,
  )
}

/** The money could not be sent: the earnings go back to the landlord's balance. */
export async function failPayout(
  payoutId: number,
  input: unknown,
): Promise<void> {
  const actor = await requireRole('superadmin')
  const d = parseOrThrow(failPayoutSchema, input)
  const payout = await repo.getPayout(payoutId)
  if (!payout) throw new ServiceError('Withdrawal not found.', 'not_found')
  const ok = await repo.decidePayout(payoutId, {
    status: 'failed',
    failed_at: new Date().toISOString(),
    failure_reason: d.reason,
  })
  if (!ok)
    throw new ServiceError('This withdrawal was already handled.', 'conflict')
  await repo.releaseEarnings(payoutId)
  await recordAudit({
    actor,
    action: 'payout.failed',
    targetType: 'payout',
    targetId: payoutId,
    summary: `Rejected withdrawal ${payout.reference} (${peso(Number(payout.amount))})`,
    details: { reason: d.reason },
  })
  await tellLandlord(
    payout.landlord_id,
    payoutId,
    'Withdrawal could not be sent',
    `Your ${peso(Number(payout.amount))} withdrawal was not sent: ${d.reason}. The money is back in your balance.`,
  )
}

export { feeBreakdown }
