'use client'

import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'

import {
  createRoomsBatchAction,
  type MutationState,
} from '@/app/(protected)/landlord/properties/actions'
import { AdvanceDepositFields } from '@/components/property/advance-deposit-fields'
import { LocationPicker } from '@/components/property/location-picker'
import { ImagePicker } from '@/components/property/image-picker'
import {
  photoJobs,
  RoomListBuilder,
  roomsPayload,
  sendRoomPhotos,
  type PhotoJob,
  type RoomItem,
} from '@/components/property/room-list-builder'
import { useStagedPhotos } from '@/components/property/use-staged-photos'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField, nativeControlClass } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import type { ImageApi, UploadFile } from '@/lib/images/upload'
import { MAX_PROPERTY_IMAGES } from '@/lib/images/rules'
import { parsePhPhone } from '@/lib/phone'
import { OWNER_PROPERTY_STATUSES } from '@/schemas/property'

type Option = { id: number; name: string }

export function PropertyForm({
  action,
  mode,
  propertyId,
  initial = {},
  typeOptions,
  roomTypeOptions = [],
  submitLabel,
  pendingLabel,
  cancelHref,
  photoApi,
  photoUpload,
}: {
  action: (state: MutationState, formData: FormData) => Promise<MutationState>
  mode: 'create' | 'edit'
  propertyId?: number
  initial?: Record<string, string>
  typeOptions: Option[]
  /** Create mode: when given, rooms can be added right here, in the same save. */
  roomTypeOptions?: Option[]
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
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [stage, setStage] = useState<string | null>(null)
  // null = the rooms are not saved yet; an array = rooms saved, these photos still to upload
  const roomPhotoJobs = useRef<PhotoJob[] | null>(null)

  /** After the property exists: save all rooms in one request, then their photos. Safe to repeat. */
  async function saveRooms(propertyId: number): Promise<string | null> {
    if (rooms.length === 0) return null
    if (roomPhotoJobs.current === null) {
      setStage('Saving rooms…')
      const res = await createRoomsBatchAction(propertyId, roomsPayload(rooms))
      setStage(null)
      if (!res.ok || !res.roomIds) {
        return `the rooms were not saved (${res.message}). You can add them from the property page.`
      }
      roomPhotoJobs.current = photoJobs(rooms, res.roomIds)
    }
    if (roomPhotoJobs.current.length > 0) {
      const failed = await sendRoomPhotos(
        propertyId,
        roomPhotoJobs.current,
        setStage,
      )
      setStage(null)
      roomPhotoJobs.current = failed
      if (failed.length > 0) {
        return `the photos for ${failed.map((f) => f.label).join(', ')} did not upload.`
      }
    }
    return null
  }

  const photos = useStagedPhotos({
    state,
    api: photoApi,
    uploadFile: photoUpload,
    targetFor: (id) => ({ kind: 'property', propertyId: id }),
    nextHref: (id) => `/landlord/properties/${id}`,
    afterCreate: mode === 'create' ? saveRooms : undefined,
  })
  const saving = photos.savedId !== undefined
  const [phone, setPhone] = useState(
    (state?.status === 'error' ? state.values?.contact_number : undefined) ??
      initial.contact_number ??
      '',
  )
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const errs = state?.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const v = { ...initial, ...(state?.status === 'error' ? state.values : {}) }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {propertyId !== undefined && (
        <input type="hidden" name="property_id" value={propertyId} />
      )}

      <FormField
        label="Property name"
        htmlFor="property_name"
        required
        error={errs.property_name}
      >
        <Input
          id="property_name"
          name="property_name"
          required
          maxLength={200}
          defaultValue={v.property_name ?? ''}
        />
      </FormField>

      <FormField
        label="Address"
        htmlFor="address"
        required
        error={errs.address}
        hint="Choose a suggestion to drop the pin, then drag it to the exact spot. Tenants see this location."
      >
        <LocationPicker
          initialAddress={v.address ?? ''}
          initialLat={v.latitude}
          initialLng={v.longitude}
          invalid={Boolean(errs.address)}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Property type"
          htmlFor="property_type_id"
          error={errs.property_type_id}
          hint={
            typeOptions.length === 0
              ? 'No property types configured.'
              : undefined
          }
        >
          <select
            id="property_type_id"
            name="property_type_id"
            className={nativeControlClass}
            defaultValue={v.property_type_id ?? ''}
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
              {OWNER_PROPERTY_STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Contact number"
          htmlFor="contact_number"
          error={errs.contact_number ?? (phoneError ? [phoneError] : undefined)}
          hint="Philippine mobile (0917 123 4567) or landline ((02) 8123 4567)."
        >
          <Input
            id="contact_number"
            name="contact_number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={30}
            placeholder="0917 123 4567"
            value={phone}
            aria-invalid={
              Boolean(errs.contact_number ?? phoneError) || undefined
            }
            onChange={(e) => {
              setPhone(e.target.value)
              setPhoneError(null)
            }}
            onBlur={() => {
              // Check as soon as they leave the field, and tidy a valid number into "+63 917 123 4567".
              if (phone.trim() === '') return setPhoneError(null)
              const result = parsePhPhone(phone)
              if (result.ok) {
                setPhone(result.display)
                setPhoneError(null)
              } else {
                setPhoneError(result.message)
              }
            }}
          />
        </FormField>
        <FormField
          label="Monthly payment rule"
          htmlFor="monthly_payment_rule"
          error={errs.monthly_payment_rule}
        >
          <Input
            id="monthly_payment_rule"
            name="monthly_payment_rule"
            maxLength={200}
            defaultValue={v.monthly_payment_rule ?? ''}
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
            max={MAX_PROPERTY_IMAGES}
            disabled={saving}
          />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Photos are managed on the property page, under Photos.
        </p>
      )}
      {stage && (
        <p role="status" className="text-muted-foreground text-sm">
          Property saved. {stage}
        </p>
      )}
      {photos.progress && (
        <p role="status" className="text-muted-foreground text-sm">
          Property saved. Uploading photo{' '}
          {Math.min(photos.progress.done + 1, photos.progress.total)} of{' '}
          {photos.progress.total}…
        </p>
      )}
      {photos.failure && (
        <Alert variant="destructive">
          <AlertDescription className="space-y-2">
            <p>The property was saved, but {photos.failure}</p>
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
        hint="The starting setting for new rooms in this property. Existing rooms keep their own; you can change it per room."
      />

      {/* Kept so saving does not erase an existing Google Place ID. */}
      <input
        type="hidden"
        name="google_place_id"
        value={v.google_place_id ?? ''}
      />

      {mode === 'create' && (
        <section
          aria-label="Rooms"
          className="space-y-3 rounded-2xl border border-border p-4"
        >
          <input type="hidden" name="room_count" value={rooms.length} />
          <div>
            <h2 className="text-base font-bold text-foreground">
              Rooms{' '}
              <span className="text-sm font-normal text-muted-foreground">
                (optional)
              </span>
            </h2>
            <p className="text-sm text-muted-foreground">
              Add rooms now — with beds, rental rates and photos — and they are
              saved together with the property in one go. Or skip this and add
              them later from the property page.
            </p>
          </div>
          <RoomListBuilder
            items={rooms}
            onChange={setRooms}
            typeOptions={roomTypeOptions}
            defaults={{ advance: false, deposit: false }}
            disabled={saving}
          />
        </section>
      )}

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
      <FormField
        label="Booking policy"
        htmlFor="booking_policy"
        error={errs.booking_policy}
      >
        <Textarea
          id="booking_policy"
          name="booking_policy"
          rows={3}
          maxLength={2000}
          defaultValue={v.booking_policy ?? ''}
        />
      </FormField>
      <FormField
        label="House rules"
        htmlFor="house_rules"
        error={errs.house_rules}
      >
        <Textarea
          id="house_rules"
          name="house_rules"
          rows={3}
          maxLength={4000}
          defaultValue={v.house_rules ?? ''}
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
