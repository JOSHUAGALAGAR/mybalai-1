'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import type { MutationState } from '@/app/(protected)/landlord/properties/actions'
import { AdvanceDepositFields } from '@/components/property/advance-deposit-fields'
import { ImagePicker } from '@/components/property/image-picker'
import { useStagedPhotos } from '@/components/property/use-staged-photos'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField, nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import type { ImageApi, UploadFile } from '@/lib/images/upload'
import { MAX_ROOM_IMAGES } from '@/lib/images/rules'
import { ROOM_STATUSES } from '@/schemas/room'

type Option = { id: number; name: string }

export function RoomForm({
  action,
  mode,
  propertyId,
  roomId,
  initial = {},
  typeOptions,
  submitLabel,
  pendingLabel,
  cancelHref,
  photoApi,
  photoUpload,
}: {
  action: (state: MutationState, formData: FormData) => Promise<MutationState>
  mode: 'create' | 'edit'
  propertyId: number
  roomId?: number
  initial?: Record<string, string>
  typeOptions: Option[]
  submitLabel: string
  pendingLabel: string
  cancelHref: string
  /** Test seams: swap the server calls / the browser→Storage transfer. */
  photoApi?: ImageApi
  photoUpload?: UploadFile
}) {
  const [state, formAction] = useActionState<MutationState, FormData>(
    action,
    undefined,
  )
  const photos = useStagedPhotos({
    state,
    api: photoApi,
    uploadFile: photoUpload,
    targetFor: (id) => ({ kind: 'room', propertyId, roomId: id }),
    nextHref: (id) => `/landlord/properties/${propertyId}/rooms/${id}`,
  })
  const saving = photos.savedId !== undefined
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const v = { ...initial, ...(state?.status === 'error' ? state.values : {}) }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="property_id" value={propertyId} />
      {roomId !== undefined && (
        <input type="hidden" name="room_id" value={roomId} />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Room number"
          htmlFor="room_number"
          error={errs.room_number}
        >
          <Input
            id="room_number"
            name="room_number"
            maxLength={40}
            defaultValue={v.room_number ?? ''}
          />
        </FormField>
        <FormField label="Room name" htmlFor="room_name" error={errs.room_name}>
          <Input
            id="room_name"
            name="room_name"
            maxLength={120}
            defaultValue={v.room_name ?? ''}
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Room type"
          htmlFor="room_type_id"
          error={errs.room_type_id}
        >
          <select
            id="room_type_id"
            name="room_type_id"
            className={nativeControlClass}
            defaultValue={v.room_type_id ?? ''}
          >
            <option value="">Not specified</option>
            {typeOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </FormField>
        {mode === 'edit' && (
          <FormField
            label="Status"
            htmlFor="status_code"
            error={errs.status_code}
          >
            <select
              id="status_code"
              name="status_code"
              className={nativeControlClass}
              defaultValue={v.status_code ?? ''}
            >
              <option value="">Leave unchanged</option>
              {ROOM_STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Floor" htmlFor="floor" error={errs.floor}>
          <Input
            id="floor"
            name="floor"
            maxLength={40}
            defaultValue={v.floor ?? ''}
          />
        </FormField>
        <FormField label="Area (sqm)" htmlFor="area_sqm" error={errs.area_sqm}>
          <Input
            id="area_sqm"
            name="area_sqm"
            inputMode="decimal"
            defaultValue={v.area_sqm ?? ''}
          />
        </FormField>
        <FormField
          label="Max occupants"
          htmlFor="max_occupants"
          required
          error={errs.max_occupants}
        >
          <Input
            id="max_occupants"
            name="max_occupants"
            inputMode="numeric"
            defaultValue={v.max_occupants ?? '1'}
          />
        </FormField>
      </div>

      {mode === 'create' ? (
        <>
          <input type="hidden" name="image_count" value={photos.files.length} />
          <ImagePicker
            label="Photos"
            files={photos.files}
            coverIndex={photos.coverIndex}
            onChange={photos.setPhotos}
            max={MAX_ROOM_IMAGES}
            disabled={saving}
          />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Photos are managed on the room page, under Photos.
        </p>
      )}
      {photos.progress && (
        <p role="status" className="text-muted-foreground text-sm">
          Room saved. Uploading photo{' '}
          {Math.min(photos.progress.done + 1, photos.progress.total)} of{' '}
          {photos.progress.total}…
        </p>
      )}
      {photos.failure && (
        <Alert variant="destructive">
          <AlertDescription className="space-y-2">
            <p>
              The room was saved, but the photos did not upload:{' '}
              {photos.failure}
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={photos.retry}>
                Try again
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={photos.skip}
              >
                Continue without photos
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <AdvanceDepositFields
        advance={v.require_advance === '1'}
        deposit={v.require_deposit === '1'}
        hint="Charged to the tenant when they book this room, together with the rent."
      />

      <FormField
        label="Description"
        htmlFor="description"
        error={errs.description}
      >
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={4000}
          defaultValue={v.description ?? ''}
        />
      </FormField>

      <div className="flex items-center gap-3 pt-1">
        {saving ? (
          <Button type="button" size="lg" disabled aria-busy>
            {photos.failure ? 'Saved' : 'Uploading photos…'}
          </Button>
        ) : (
          <SubmitButton pendingText={pendingLabel}>{submitLabel}</SubmitButton>
        )}
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
