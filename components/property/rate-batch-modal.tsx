'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { createRatesBatchAction } from '@/app/(protected)/landlord/properties/actions'
import {
  blankRate,
  RateInputRow,
  type RateInput,
} from '@/components/property/rate-draft-fields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { nativeControlClass } from '@/components/ui/form-field'
import { todayInManila } from '@/lib/drafts/today'
import {
  MAX_BATCH_RATES,
  roomRateDraftSchema,
  type RoomRateDraft,
} from '@/schemas/room-batch'

type RoomOption = { room_id: number; label: string }

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

/** "Add rental rates" window: collect rates for any of the rooms, then save them in one request. */
export function RateBatchModal({
  propertyId,
  rooms,
}: {
  propertyId: number
  rooms: RoomOption[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<RoomRateDraft[]>([])
  const draft = {
    items,
    add: (...more: RoomRateDraft[]) => setItems((cur) => [...cur, ...more]),
    removeAt: (i: number) => setItems((cur) => cur.filter((_, j) => j !== i)),
    clear: () => setItems([]),
  }
  const today = useMemo(() => todayInManila(), [])
  const [open, setOpen] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [rate, setRate] = useState<RateInput>(() => blankRate(today))
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  )

  const labelOf = (id: number) =>
    rooms.find((r) => r.room_id === id)?.label ?? `Room #${id}`

  function addToList() {
    setResult(null)
    if (draft.items.length >= MAX_BATCH_RATES) {
      return setProblem(
        `A list can hold ${MAX_BATCH_RATES} rates. Save these first.`,
      )
    }
    const parsed = roomRateDraftSchema.safeParse({ ...rate, room_id: roomId })
    if (!parsed.success) return setProblem(parsed.error.issues[0].message)
    setProblem(null)
    draft.add(parsed.data)
    setRate((r) => ({ ...r, price: '' })) // same period and dates are usually reused for the next room
    setRoomId('')
  }

  async function saveAll() {
    setSaving(true)
    setResult(null)
    try {
      const res = await createRatesBatchAction(
        propertyId,
        JSON.stringify({ version: 1, rates: draft.items }),
      )
      setResult(res)
      if (res.ok) {
        draft.clear()
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Plus className="size-4" aria-hidden />
          Add rental rates
          {draft.items.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {draft.items.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add rental rates</DialogTitle>
          <DialogDescription>
            Pick a room and its price, add it to the list, repeat — then save
            everything at once.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          <section className="space-y-3" aria-label="New rate">
            <div className="space-y-1.5">
              <label
                htmlFor="rr-room"
                className="text-xs font-semibold text-muted-foreground"
              >
                Room
              </label>
              <select
                id="rr-room"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className={nativeControlClass}
              >
                <option value="">Select…</option>
                {rooms.map((r) => (
                  <option key={r.room_id} value={r.room_id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <RateInputRow idPrefix="rr" value={rate} onChange={setRate} />
            {problem && (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            )}
            <Button type="button" onClick={addToList} disabled={saving}>
              <Plus className="size-4" aria-hidden /> Add to list
            </Button>
          </section>

          <section className="space-y-3" aria-label="Rates to save">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Ready to save{' '}
                <span className="font-normal text-muted-foreground">
                  ({draft.items.length})
                </span>
              </h3>
            </div>
            {draft.items.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nothing yet. Choose a room and a price above and press “Add to
                list”.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border">
                {draft.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold text-foreground">
                        {labelOf(item.room_id)}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {peso.format(item.price)}{' '}
                        <span className="capitalize">{item.period}</span> · from{' '}
                        {item.valid_from}
                        {item.valid_until ? ` until ${item.valid_until}` : ''}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => draft.removeAt(i)}
                      aria-label="Remove this rate"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {result && (
              <Alert variant={result.ok ? 'default' : 'destructive'}>
                <AlertDescription>{result.message}</AlertDescription>
              </Alert>
            )}
          </section>
        </DialogBody>

        <DialogFooter className="justify-end">
          <Button
            type="button"
            size="lg"
            onClick={saveAll}
            disabled={saving || draft.items.length === 0}
            aria-busy={saving}
          >
            {saving
              ? 'Saving…'
              : `Save ${draft.items.length} ${draft.items.length === 1 ? 'rate' : 'rates'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
