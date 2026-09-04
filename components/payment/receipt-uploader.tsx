'use client'

import { useActionState, useRef, useState } from 'react'

import {
  attachReceiptAction,
  type PaymentActionState,
} from '@/app/(protected)/payments/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { RECEIPT_BUCKET } from '@/schemas/payment'

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(-80)
}

export function ReceiptUploader({ paymentId }: { paymentId: number }) {
  const [state, action] = useActionState<PaymentActionState, FormData>(
    attachReceiptAction,
    undefined,
  )
  const formRef = useRef<HTMLFormElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<{
    path: string
    name: string
    type: string
    size: number
  } | null>(null)

  async function upload() {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const supabase = createClient()
      const path = `${paymentId}/${crypto.randomUUID()}-${safeName(file.name)}`
      const { error } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .upload(path, file, { contentType: file.type || undefined })
      if (error) {
        setUploadError(
          'Upload failed. The receipts bucket may not be set up yet.',
        )
        return
      }
      setUploaded({
        path,
        name: file.name,
        type: file.type,
        size: file.size,
      })
      // record the metadata
      requestAnimationFrame(() => formRef.current?.requestSubmit())
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {uploadError && (
        <Alert variant="destructive">
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
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

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!file || uploading}
          onClick={upload}
        >
          {uploading ? 'Uploading…' : 'Attach receipt'}
        </Button>
      </div>

      <form ref={formRef} action={action} className="hidden">
        <input type="hidden" name="payment_id" value={paymentId} />
        <input type="hidden" name="storage_path" value={uploaded?.path ?? ''} />
        <input
          type="hidden"
          name="original_filename"
          value={uploaded?.name ?? ''}
        />
        <input type="hidden" name="mime_type" value={uploaded?.type ?? ''} />
        <input type="hidden" name="file_size" value={uploaded?.size ?? ''} />
      </form>
    </div>
  )
}
