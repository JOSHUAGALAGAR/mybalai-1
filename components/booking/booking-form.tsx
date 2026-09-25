'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import type { BookingFormState } from '@/app/(protected)/discover/[propertyId]/book/actions'
import { createBookingAction } from '@/app/(protected)/discover/[propertyId]/book/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField, nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import {
  advanceDepositLabel,
  bookingCharges,
  nightsBetween,
} from '@/schemas/booking'
import type { BookingFormRoom } from '@/services/bookings.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function BookingForm({
  propertyId,
  propertyName,
  rooms,
}: {
  propertyId: number
  propertyName: string
  rooms: BookingFormRoom[]
}) {
  const [state, action] = useActionState<BookingFormState, FormData>(
    createBookingAction,
    undefined,
  )
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}

  const [roomId, setRoomId] = useState<number | ''>(rooms[0]?.roomId ?? '')
  const room = rooms.find((r) => r.roomId === roomId)

  const [bedId, setBedId] = useState<number | ''>(room?.beds[0]?.bedId ?? '')
  const [period, setPeriod] = useState<string>(room?.rates[0]?.period ?? '')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')

  const rate = room?.rates.find((r) => r.period === period)
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0
  const estimate =
    rate && nights > 0
      ? bookingCharges({
          period: rate.period,
          unitPrice: rate.price,
          nights,
          requireAdvance: room?.requireAdvance ?? false,
          requireDeposit: room?.requireDeposit ?? false,
        })
      : null
  const upfront = room
    ? advanceDepositLabel(room.requireAdvance, room.requireDeposit)
    : null

  if (rooms.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          This property has no rooms with both a bed and a published rate yet.
        </AlertDescription>
      </Alert>
    )
  }

  function onRoomChange(next: number) {
    setRoomId(next)
    const r = rooms.find((x) => x.roomId === next)
    setBedId(r?.beds[0]?.bedId ?? '')
    setPeriod(r?.rates[0]?.period ?? '')
  }

  return (
    <form action={action} className="max-w-xl space-y-5" noValidate>
      <input type="hidden" name="property_id" value={propertyId} />

      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <FormField label="Room" htmlFor="room_id" error={errs.room_id} required>
        <select
          id="room_id"
          name="room_id"
          className={nativeControlClass}
          value={roomId}
          onChange={(e) => onRoomChange(Number(e.target.value))}
        >
          {rooms.map((r) => (
            <option key={r.roomId} value={r.roomId}>
              {r.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Bed" htmlFor="bed_id" error={errs.bed_id} required>
        <select
          id="bed_id"
          name="bed_id"
          className={nativeControlClass}
          value={bedId}
          onChange={(e) => setBedId(Number(e.target.value))}
        >
          {(room?.beds ?? []).map((b) => (
            <option key={b.bedId} value={b.bedId}>
              Bed {b.bedNumber}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Rate" htmlFor="period" error={errs.period} required>
        <select
          id="period"
          name="period"
          className={nativeControlClass}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          {(room?.rates ?? []).map((r) => (
            <option key={r.period} value={r.period}>
              {r.period[0].toUpperCase() + r.period.slice(1)} —{' '}
              {peso.format(r.price)}
            </option>
          ))}
        </select>
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Check-in"
          htmlFor="check_in"
          error={errs.check_in}
          required
        >
          <Input
            id="check_in"
            name="check_in"
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </FormField>
        <FormField
          label="Check-out"
          htmlFor="check_out"
          error={errs.check_out}
          required
        >
          <Input
            id="check_out"
            name="check_out"
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </FormField>
      </div>

      <FormField
        label="Message to the landlord"
        htmlFor="message"
        error={errs.message}
      >
        <Textarea id="message" name="message" rows={3} maxLength={2000} />
      </FormField>

      {upfront && (
        <Alert>
          <AlertDescription>
            This room requires <strong>{upfront}</strong>, paid together with
            your first payment. The deposit is refundable.
          </AlertDescription>
        </Alert>
      )}

      {estimate && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="text-muted-foreground">
            {nights} night{nights === 1 ? '' : 's'} · {estimate.units}{' '}
            {rate?.period} unit{estimate.units === 1 ? '' : 's'}
          </p>
          <dl className="mt-2 space-y-1">
            <Line label="Rent" amount={estimate.rent} />
            {estimate.advance > 0 && (
              <Line label="1 month advance" amount={estimate.advance} />
            )}
            {estimate.deposit > 0 && (
              <Line
                label="1 month deposit (refundable)"
                amount={estimate.deposit}
              />
            )}
          </dl>
          <p className="mt-2 border-t border-border pt-2 text-base font-semibold text-foreground">
            Estimated total {peso.format(estimate.total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            An estimate — the landlord confirms the final amount.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Sending request…">
          Request to book
        </SubmitButton>
        <Button asChild variant="outline">
          <Link href={`/discover/${propertyId}`}>Cancel</Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Your request for {propertyName} starts as <strong>pending</strong> until
        the landlord reviews it.
      </p>
    </form>
  )
}

function Line({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{peso.format(amount)}</dd>
    </div>
  )
}
