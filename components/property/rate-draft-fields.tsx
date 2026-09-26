'use client'

import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { RATE_PERIODS } from '@/schemas/rental-rate'

/** A rate being typed into the form (everything is text until it is validated). */
export type RateInput = {
  period: string
  price: string
  valid_from: string
  valid_until: string
}

export const blankRate = (today: string): RateInput => ({
  period: 'monthly',
  price: '',
  valid_from: today,
  valid_until: '',
})

/** One row of rate inputs: period · price · from · until (· remove). Used by both modals. */
export function RateInputRow({
  value,
  onChange,
  onRemove,
  idPrefix,
}: {
  value: RateInput
  onChange: (next: RateInput) => void
  onRemove?: () => void
  idPrefix: string
}) {
  const set = (patch: Partial<RateInput>) => onChange({ ...value, ...patch })
  return (
    <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[7rem_1fr_1fr_1fr_auto]">
      <label
        className="text-xs font-semibold text-muted-foreground"
        htmlFor={`${idPrefix}-period`}
      >
        Period
        <select
          id={`${idPrefix}-period`}
          value={value.period}
          onChange={(e) => set({ period: e.target.value })}
          className={`${nativeControlClass} mt-1 h-10 capitalize`}
        >
          {RATE_PERIODS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label
        className="text-xs font-semibold text-muted-foreground"
        htmlFor={`${idPrefix}-price`}
      >
        Price (₱)
        <Input
          id={`${idPrefix}-price`}
          inputMode="decimal"
          value={value.price}
          onChange={(e) => set({ price: e.target.value })}
          className="mt-1 h-10"
        />
      </label>
      <label
        className="text-xs font-semibold text-muted-foreground"
        htmlFor={`${idPrefix}-from`}
      >
        Valid from
        <Input
          id={`${idPrefix}-from`}
          type="date"
          value={value.valid_from}
          onChange={(e) => set({ valid_from: e.target.value })}
          className="mt-1 h-10"
        />
      </label>
      <label
        className="text-xs font-semibold text-muted-foreground"
        htmlFor={`${idPrefix}-until`}
      >
        Valid until
        <Input
          id={`${idPrefix}-until`}
          type="date"
          value={value.valid_until}
          onChange={(e) => set({ valid_until: e.target.value })}
          className="mt-1 h-10"
        />
      </label>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label="Remove this rate"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      )}
    </div>
  )
}
