'use client'

import { IMAGE_BUCKET } from '@/lib/images/rules'
import type { UploadFile } from '@/lib/images/upload'
import { createClient } from '@/lib/supabase/client'

/** The real transfer: straight from the browser to Storage using the one-time link's token. */
export const uploadToStorage: UploadFile = async (path, token, file) => {
  const { error } = await createClient()
    .storage.from(IMAGE_BUCKET)
    .uploadToSignedUrl(path, token, file, {
      contentType: file.type,
      cacheControl: '31536000', // photos never change in place: cache for a year
    })
  return error ? { ok: false, message: error.message } : { ok: true }
}
