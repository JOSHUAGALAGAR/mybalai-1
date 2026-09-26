'use client'

import { useActionState, useState } from 'react'

import {
  requestWithdrawalAction,
  saveMethodAction,
  type EarningsFormState,
} from '@/app/(protected)/landlord/earnings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField, nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { WITHDRAWAL_METHODS } from '@/lib/payouts/rules'
import type { MyEarnings } from '@/services/payouts.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})
const dateFmt = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'long',
  timeZone: 'Asia/Manila',
})
const fmtDay = (iso: string) =>
  dateFmt.format(new Date(`${iso}T00:00:00+08:00`))

/** The withdraw button (only enabled on the withdrawal day), and where the money goes. */
export function WithdrawCard({ data }: { data: MyEarnings }) {
  const [state, action, pending] = useActionState<EarningsFormState, void>(
    requestWithdrawalAction,
    undefined,
  )
  const [editing, setEditing] = useState(false)
  const canWithdraw = data.blocker === null

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-foreground">
            Withdraw your earnings
          </p>
          <p className="text-sm text-muted-foreground">
            You can withdraw on day {data.rules.withdrawalDay} of each month,
            from {peso.format(data.rules.minimumThreshold)}.{' '}
            {data.isWithdrawalDay ? (
              <span className="font-semibold text-foreground">
                Today is a withdrawal day.
              </span>
            ) : (
              <>
                Next:{' '}
                <span className="font-semibold text-foreground">
                  {fmtDay(data.nextWithdrawalDate)}
                </span>
                .
              </>
            )}
          </p>
        </div>
        <form action={() => action()}>
          <Button
            type="submit"
            size="lg"
            disabled={!canWithdraw || pending}
            aria-busy={pending}
          >
            {pending
              ? 'Requesting…'
              : `Withdraw ${peso.format(data.available)}`}
          </Button>
        </form>
      </div>

      {!canWithdraw && data.blocker && (
        <p className="text-sm text-muted-foreground">{data.blocker}</p>
      )}
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

      <div className="border-t border-border pt-3">
        {data.method && !editing ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Sent to </span>
              <span className="font-semibold text-foreground">
                {data.method.label} · {data.method.accountName}
              </span>
              <span className="text-muted-foreground">
                {' '}
                · {data.method.masked}
              </span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Change
            </Button>
          </div>
        ) : (
          <MethodForm
            onDone={() => setEditing(false)}
            canCancel={Boolean(data.method)}
          />
        )}
      </div>
    </div>
  )
}

function MethodForm({
  onDone,
  canCancel,
}: {
  onDone: () => void
  canCancel: boolean
}) {
  const [state, action] = useActionState<EarningsFormState, FormData>(
    async (prev, fd) => {
      const result = await saveMethodAction(prev, fd)
      if (result?.status === 'success') onDone()
      return result
    },
    undefined,
  )
  const [type, setType] = useState<string>(WITHDRAWAL_METHODS[0].code)
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}

  return (
    <form action={action} className="space-y-3" noValidate>
      <p className="text-sm font-semibold text-foreground">
        Where should we send your money?
      </p>
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Send via"
          htmlFor="method_type"
          error={errs.method_type}
        >
          <select
            id="method_type"
            name="method_type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={nativeControlClass}
          >
            {WITHDRAWAL_METHODS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </FormField>
        {type === 'bank' && (
          <FormField label="Bank" htmlFor="bank_name" error={errs.bank_name}>
            <Input
              id="bank_name"
              name="bank_name"
              placeholder="e.g. BDO"
              maxLength={80}
            />
          </FormField>
        )}
        <FormField
          label="Account holder’s name"
          htmlFor="account_name"
          error={errs.account_name}
        >
          <Input
            id="account_name"
            name="account_name"
            maxLength={120}
            autoComplete="name"
          />
        </FormField>
        <FormField
          label={type === 'bank' ? 'Account number' : 'Mobile number'}
          htmlFor="account_number"
          error={errs.account_number}
        >
          <Input
            id="account_number"
            name="account_number"
            inputMode="numeric"
            maxLength={30}
          />
        </FormField>
      </div>
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
        {canCancel && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
