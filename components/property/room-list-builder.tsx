'use client'

import { BedDouble, ImageIcon, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { serverImageApi } from '@/components/property/image-api'
import { ImagePicker } from '@/components/property/image-picker'
import {
  blankRate,
  RateInputRow,
  type RateInput,
} from '@/components/property/rate-draft-fields'
import { Button } from '@/components/ui/button'
import { nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { todayInManila } from '@/lib/drafts/today'
import { uploadToStorage } from '@/lib/images/browser-upload'
import { MAX_ROOM_IMAGES } from '@/lib/images/rules'
import { uploadImages } from '@/lib/images/upload'
import {
  MAX_BATCH_ROOMS,
  MAX_RATES_PER_DRAFT_ROOM,
  roomDraftSchema,
  type RoomDraft,
} from '@/schemas/room-batch'

export type TypeOption = { id: number; name: string }

export type Photos = { files: File[]; cover: number }

/** A room waiting in the list: its data, and the photos that go with it. */
export type RoomItem = { data: RoomDraft } & Photos

/** A saved room whose photos still need uploading (or did not make it the first time). */
export type PhotoJob = { roomId: number; label: string } & Photos

const NO_PHOTOS: Photos = { files: [], cover: 0 }

/** What is typed into the form (everything is text until it is validated). */
type RoomInput = {
  room_number: string
  room_name: string
  room_type_id: string
  floor: string
  area_sqm: string
  max_occupants: string
  beds: string
  description: string
  require_advance: boolean
  require_deposit: boolean
  rates: RateInput[]
}

const blankRoom = (defaults: {
  advance: boolean
  deposit: boolean
}): RoomInput => ({
  room_number: '',
  room_name: '',
  room_type_id: '',
  floor: '',
  area_sqm: '',
  max_occupants: '1',
  beds: '1',
  description: '',
  require_advance: defaults.advance,
  require_deposit: defaults.deposit,
  rates: [],
})

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export const roomLabel = (r: RoomDraft, i: number) =>
  [r.room_number, r.room_name].filter(Boolean).join(' · ') || `Room ${i + 1}`

/** The JSON that goes to the server for a whole list: one request creates every room, bed and rate. */
export const roomsPayload = (items: RoomItem[]) =>
  JSON.stringify({ version: 1, rooms: items.map((i) => i.data) })

/** Pair each saved room (by id, in list order) with the photos chosen for it. */
export const photoJobs = (items: RoomItem[], roomIds: number[]): PhotoJob[] =>
  items.flatMap((item, i) =>
    item.files.length > 0
      ? [
          {
            roomId: roomIds[i],
            label: roomLabel(item.data, i),
            files: item.files,
            cover: item.cover,
          },
        ]
      : [],
  )

/** Upload each room's photos straight to storage. Returns the jobs that failed. */
export async function sendRoomPhotos(
  propertyId: number,
  jobs: PhotoJob[],
  onProgress?: (text: string) => void,
): Promise<PhotoJob[]> {
  const failed: PhotoJob[] = []
  for (const [n, job] of jobs.entries()) {
    onProgress?.(
      `Uploading photos for ${job.label} (${n + 1} of ${jobs.length})…`,
    )
    const done = await uploadImages({
      target: { kind: 'room', propertyId, roomId: job.roomId },
      files: job.files,
      coverIndex: job.cover,
      api: serverImageApi,
      uploadFile: uploadToStorage,
    })
    if (!done.ok) failed.push(job)
  }
  return failed
}

/**
 * Build a list of rooms — each with beds, rental rates and photos. Controlled: the parent owns
 * the list and decides when to save it (the "Add rooms" window, or the Add property form).
 */
export function RoomListBuilder({
  items,
  onChange,
  typeOptions,
  defaults,
  disabled,
}: {
  items: RoomItem[]
  onChange: (items: RoomItem[]) => void
  typeOptions: TypeOption[]
  /** A new room starts with these advance / deposit switches. */
  defaults: { advance: boolean; deposit: boolean }
  disabled?: boolean
}) {
  const today = useMemo(() => todayInManila(), [])
  const [form, setForm] = useState<RoomInput>(() => blankRoom(defaults))
  const [photos, setPhotos] = useState<Photos>(NO_PHOTOS)
  const [problem, setProblem] = useState<string | null>(null)

  const set = (patch: Partial<RoomInput>) =>
    setForm((f) => ({ ...f, ...patch }))

  function addToList() {
    if (items.length >= MAX_BATCH_ROOMS) {
      return setProblem(
        `A list can hold ${MAX_BATCH_ROOMS} rooms. Save these first.`,
      )
    }
    const parsed = roomDraftSchema.safeParse(form)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const rateIndex =
        issue.path[0] === 'rates' && typeof issue.path[1] === 'number'
          ? issue.path[1] + 1
          : null
      return setProblem(
        rateIndex ? `Rate ${rateIndex}: ${issue.message}` : issue.message,
      )
    }
    setProblem(null)
    onChange([...items, { data: parsed.data, ...photos }])
    // keep the settings for the next, similar room — only what makes this one unique is cleared
    set({ room_number: '', room_name: '' })
    setPhotos(NO_PHOTOS)
  }

  return (
    <div
      className="space-y-6"
      // Pressing Enter in a field must not submit a surrounding form (e.g. Add property).
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault()
        }
      }}
    >
      <section className="space-y-4" aria-label="New room">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Room number" id="rb-number">
            <Input
              id="rb-number"
              value={form.room_number}
              maxLength={40}
              onChange={(e) => set({ room_number: e.target.value })}
            />
          </Field>
          <Field label="Room name" id="rb-name">
            <Input
              id="rb-name"
              value={form.room_name}
              maxLength={120}
              onChange={(e) => set({ room_name: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Room type" id="rb-type">
            <select
              id="rb-type"
              value={form.room_type_id}
              onChange={(e) => set({ room_type_id: e.target.value })}
              className={nativeControlClass}
            >
              <option value="">Not specified</option>
              {typeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Floor" id="rb-floor">
            <Input
              id="rb-floor"
              value={form.floor}
              maxLength={40}
              onChange={(e) => set({ floor: e.target.value })}
            />
          </Field>
          <Field label="Area (sqm)" id="rb-area">
            <Input
              id="rb-area"
              inputMode="decimal"
              value={form.area_sqm}
              onChange={(e) => set({ area_sqm: e.target.value })}
            />
          </Field>
          <Field label="Max occupants" id="rb-max">
            <Input
              id="rb-max"
              inputMode="numeric"
              value={form.max_occupants}
              onChange={(e) => set({ max_occupants: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label="Beds to create" id="rb-beds">
            <Input
              id="rb-beds"
              inputMode="numeric"
              value={form.beds}
              onChange={(e) => set({ beds: e.target.value })}
            />
          </Field>
          <Field label="Description" id="rb-desc">
            <Textarea
              id="rb-desc"
              rows={2}
              maxLength={4000}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>
        </div>

        <ImagePicker
          label="Photos of this room"
          files={photos.files}
          coverIndex={photos.cover}
          onChange={(files, cover) => setPhotos({ files, cover })}
          max={MAX_ROOM_IMAGES}
          disabled={disabled}
        />

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={form.require_advance}
              onChange={(e) => set({ require_advance: e.target.checked })}
            />
            1 month advance
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={form.require_deposit}
              onChange={(e) => set({ require_deposit: e.target.checked })}
            />
            1 month deposit (refundable)
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Rental rates for this room
          </p>
          {form.rates.map((rate, i) => (
            <RateInputRow
              key={i}
              idPrefix={`rb-rate-${i}`}
              value={rate}
              onChange={(next) =>
                set({ rates: form.rates.map((r, j) => (j === i ? next : r)) })
              }
              onRemove={() =>
                set({ rates: form.rates.filter((_, j) => j !== i) })
              }
            />
          ))}
          {form.rates.length < MAX_RATES_PER_DRAFT_ROOM && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => set({ rates: [...form.rates, blankRate(today)] })}
            >
              <Plus className="size-4" aria-hidden /> Add a rate
            </Button>
          )}
        </div>

        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        <Button type="button" onClick={addToList} disabled={disabled}>
          <Plus className="size-4" aria-hidden /> Add to list
        </Button>
      </section>

      <section className="space-y-3" aria-label="Rooms to save">
        <h3 className="text-sm font-bold text-foreground">
          Ready to save{' '}
          <span className="font-normal text-muted-foreground">
            ({items.length})
          </span>
        </h3>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Nothing yet. Fill in a room above and press “Add to list”.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {items.map(({ data: room, files }, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-foreground">
                    {roomLabel(room, i)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <BedDouble
                      className="mr-1 inline size-3.5 align-[-2px]"
                      aria-hidden
                    />
                    {room.beds} {room.beds === 1 ? 'bed' : 'beds'} · up to{' '}
                    {room.max_occupants}
                    {room.rates.length > 0 &&
                      ` · ${room.rates.map((r) => `${peso.format(r.price)}/${r.period}`).join(', ')}`}
                    {room.require_advance && ' · advance'}
                    {room.require_deposit && ' · deposit'}
                    {files.length > 0 && (
                      <>
                        {' · '}
                        <ImageIcon
                          className="mr-0.5 inline size-3.5 align-[-2px]"
                          aria-hidden
                        />
                        {files.length} {files.length === 1 ? 'photo' : 'photos'}
                      </>
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  aria-label={`Remove ${roomLabel(room, i)}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Field({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  )
}
