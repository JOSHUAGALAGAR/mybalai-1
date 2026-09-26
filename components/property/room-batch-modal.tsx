'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createRoomsBatchAction } from '@/app/(protected)/landlord/properties/actions'
import {
  photoJobs,
  RoomListBuilder,
  roomsPayload,
  sendRoomPhotos,
  type PhotoJob,
  type RoomItem,
  type TypeOption,
} from '@/components/property/room-list-builder'
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

/**
 * "Add rooms" window on the property page. Rooms — each with its beds, rental rates and photos —
 * are collected in a list, then saved together: ONE request creates every room, bed and rate,
 * and the photos are uploaded straight to storage right after.
 */
export function RoomBatchModal({
  propertyId,
  typeOptions,
  defaults,
}: {
  propertyId: number
  typeOptions: TypeOption[]
  /** The property's advance / deposit settings: a new room starts with them. */
  defaults: { advance: boolean; deposit: boolean }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<RoomItem[]>([])
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  )
  const [retry, setRetry] = useState<PhotoJob[]>([])

  function finish(message: string) {
    setResult({ ok: true, message })
    setItems([])
    setRetry([])
    router.refresh()
  }

  async function saveAll() {
    setSaving(true)
    setResult(null)
    try {
      const res = await createRoomsBatchAction(propertyId, roomsPayload(items))
      if (!res.ok || !res.roomIds) return setResult(res)

      const failed = await sendRoomPhotos(
        propertyId,
        photoJobs(items, res.roomIds),
        setProgress,
      )
      setProgress(null)
      if (failed.length === 0) return finish(res.message)

      // The rooms are saved; only some photos are outstanding.
      setItems([])
      setRetry(failed)
      router.refresh()
      setResult({
        ok: false,
        message: `${res.message} But the photos for ${failed.map((f) => f.label).join(', ')} did not upload.`,
      })
    } finally {
      setSaving(false)
    }
  }

  async function retryPhotos() {
    setSaving(true)
    try {
      const failed = await sendRoomPhotos(propertyId, retry, setProgress)
      setProgress(null)
      if (failed.length === 0) return finish('All photos uploaded.')
      setRetry(failed)
      setResult({
        ok: false,
        message: `Still could not upload the photos for ${failed.map((f) => f.label).join(', ')}.`,
      })
    } finally {
      setSaving(false)
    }
  }

  const totalBeds = items.reduce((n, r) => n + r.data.beds, 0)
  const pending = items.length + retry.length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Plus className="size-4" aria-hidden />
          Add rooms
          {pending > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {pending}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add rooms</DialogTitle>
          <DialogDescription>
            Fill in a room — with its beds, rental rates and photos — and add it
            to the list. Add as many as you like, then save them all at once.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {retry.length === 0 && (
            <RoomListBuilder
              items={items}
              onChange={setItems}
              typeOptions={typeOptions}
              defaults={defaults}
              disabled={saving}
            />
          )}
          {progress && (
            <p role="status" className="text-sm text-muted-foreground">
              {progress}
            </p>
          )}
          {result && (
            <Alert variant={result.ok ? 'default' : 'destructive'}>
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}
        </DialogBody>

        <DialogFooter>
          {retry.length > 0 ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() =>
                  finish(
                    'Rooms saved. You can add the photos later from each room’s page.',
                  )
                }
              >
                Continue without photos
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={retryPhotos}
                disabled={saving}
                aria-busy={saving}
              >
                {saving ? 'Uploading…' : 'Try the photos again'}
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                {items.length > 0 &&
                  `${items.length} ${items.length === 1 ? 'room' : 'rooms'} · ${totalBeds} beds`}
              </span>
              <Button
                type="button"
                size="lg"
                onClick={saveAll}
                disabled={saving || items.length === 0}
                aria-busy={saving}
              >
                {saving
                  ? 'Saving…'
                  : `Save ${items.length} ${items.length === 1 ? 'room' : 'rooms'}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
