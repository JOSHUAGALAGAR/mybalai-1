'use client'

import { useActionState, useState } from 'react'

import {
  saveSettingsAction,
  type PayoutFormState,
} from '@/app/(protected)/admin/payouts/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  feeBreakdown,
  formatPct,
  nextWithdrawalDate,
} from '@/lib/payouts/rules'
import type { PayoutRules } from '@/services/payouts.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})
const dateFmt = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'long',
  timeZone: 'Asia/Manila',
})

const num = (v: string, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function PayoutSettingsForm({ rules }: { rules: PayoutRules }) {
  const [state, action] = useActionState<PayoutFormState, FormData>(
    saveSettingsAction,
    undefined,
  )
  const [pm, setPm] = useState(String(rules.paymongoFeePct))
  const [plat, setPlat] = useState(String(rules.platformFeePct))
  const [day, setDay] = useState(String(rules.withdrawalDay))
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}

  const example = feeBreakdown(1000, {
    paymongoPct: num(pm),
    platformPct: num(plat),
  })
  const dayNum = Math.min(Math.max(Math.round(num(day, 30)), 1), 31)
  const next = dateFmt.format(
    new Date(`${nextWithdrawalDate(new Date(), dayNum)}T00:00:00+08:00`),
  )

  return (
    <form
      action={action}
      className="grid max-w-3xl gap-6 lg:grid-cols-[1fr_18rem]"
      noValidate
    >
      <div className="space-y-5">
        {state?.status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {state?.status === 'success' && (
          <Alert>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <fieldset className="space-y-4 rounded-2xl border border-border p-4">
          <legend className="px-1 text-sm font-bold text-foreground">
            Fees taken from each online payment
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="PayMongo fee (%)"
              htmlFor="paymongo_fee_rate"
              error={errs.paymongo_fee_rate}
              hint="What PayMongo charges per transaction (QR Ph: 1.5%)."
            >
              <Input
                id="paymongo_fee_rate"
                name="paymongo_fee_rate"
                inputMode="decimal"
                value={pm}
                onChange={(e) => setPm(e.target.value)}
              />
            </FormField>
            <FormField
              label="MyBalai platform fee (%)"
              htmlFor="platform_fee_rate"
              error={errs.platform_fee_rate}
              hint="MyBalai’s own cut."
            >
              <Input
                id="platform_fee_rate"
                name="platform_fee_rate"
                inputMode="decimal"
                value={plat}
                onChange={(e) => setPlat(e.target.value)}
              />
            </FormField>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-2xl border border-border p-4">
          <legend className="px-1 text-sm font-bold text-foreground">
            Withdrawals
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              label="Withdrawal day of the month"
              htmlFor="withdrawal_day"
              error={errs.withdrawal_day}
              hint="Landlords can withdraw only on this day. Short months use their last day."
            >
              <Input
                id="withdrawal_day"
                name="withdrawal_day"
                inputMode="numeric"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </FormField>
            <FormField
              label="Minimum withdrawal (₱)"
              htmlFor="minimum_threshold"
              error={errs.minimum_threshold}
              hint="Below this, the money waits for next month."
            >
              <Input
                id="minimum_threshold"
                name="minimum_threshold"
                inputMode="decimal"
                defaultValue={String(rules.minimumThreshold)}
              />
            </FormField>
            <FormField
              label="Hold days"
              htmlFor="hold_days"
              error={errs.hold_days}
              hint="Days after a payment before it can be withdrawn."
            >
              <Input
                id="hold_days"
                name="hold_days"
                inputMode="numeric"
                defaultValue={String(rules.holdDays)}
              />
            </FormField>
          </div>
        </fieldset>

        <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
      </div>

      <aside
        aria-label="Example"
        className="h-fit space-y-3 rounded-2xl border border-border bg-primary-soft p-4 text-sm"
      >
        <p className="font-bold text-foreground">What a landlord sees</p>
        <dl className="space-y-1.5">
          <Row label="Tenant pays" value={peso.format(example.gross)} muted />
          <Row
            label={`− PayMongo fee (${formatPct(num(pm))}%)`}
            value={peso.format(example.paymongoFee)}
            muted
          />
          <Row
            label={`− MyBalai fee (${formatPct(num(plat))}%)`}
            value={peso.format(example.platformFee)}
            muted
          />
          <div className="border-t border-border pt-1.5">
            <Row label="Landlord gets" value={peso.format(example.net)} />
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Next withdrawal day:{' '}
          <span className="font-semibold text-foreground">{next}</span>
        </p>
      </aside>
    </form>
  )
}

function Row({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt
        className={
          muted ? 'text-muted-foreground' : 'font-semibold text-foreground'
        }
      >
        {label}
      </dt>
      <dd
        className={
          muted
            ? 'text-foreground tabular-nums'
            : 'font-extrabold text-foreground tabular-nums'
        }
      >
        {value}
      </dd>
    </div>
  )
}
