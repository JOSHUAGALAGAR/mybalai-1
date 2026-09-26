'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { MutationState } from '@/app/(protected)/landlord/properties/actions'
import { serverImageApi } from '@/components/property/image-api'
import { uploadToStorage } from '@/lib/images/browser-upload'
import type { ImageTarget } from '@/lib/images/rules'
import {
  uploadImages,
  type ImageApi,
  type UploadFile,
} from '@/lib/images/upload'

/**
 * Photos chosen on an Add form. They can only be uploaded once the property/room exists, so
 * the create action answers `{status:'success', entityId}` and this hook then uploads them and
 * moves on. If the upload fails the record is already saved — the user can retry or continue
 * and add photos later from the detail page.
 */
export function useStagedPhotos({
  state,
  targetFor,
  nextHref,
  api = serverImageApi,
  uploadFile = uploadToStorage,
  afterCreate,
}: {
  state: MutationState
  targetFor: (entityId: number) => ImageTarget
  nextHref: (entityId: number) => string
  api?: ImageApi
  uploadFile?: UploadFile
  /**
   * Another step that needs the new record's id (e.g. saving its rooms). Runs before the photos.
   * Return an error message, or null when done. It may be called again on "Try again", so it
   * must not redo work that already succeeded.
   */
  afterCreate?: (entityId: number) => Promise<string | null>
}) {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [coverIndex, setCoverIndex] = useState(0)
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const started = useRef<number | null>(null)

  const entityId = state?.status === 'success' ? state.entityId : undefined

  async function send(id: number) {
    setFailure(null)
    if (afterCreate) {
      const problem = await afterCreate(id)
      if (problem) return setFailure(problem)
    }
    if (files.length === 0) {
      router.push(nextHref(id))
      return
    }
    setProgress({ done: 0, total: files.length })
    const result = await uploadImages({
      target: targetFor(id),
      files,
      coverIndex,
      api,
      uploadFile,
      onProgress: (done, total) => setProgress({ done, total }),
    })
    if (result.ok) {
      router.push(nextHref(id))
      return
    }
    setProgress(null)
    setFailure(result.message)
  }

  useEffect(() => {
    if (entityId === undefined || started.current === entityId) return
    started.current = entityId
    void send(entityId)
    // `send` reads the files as they were when the form was submitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId])

  return {
    files,
    coverIndex,
    setPhotos: (next: File[], cover: number) => {
      setFiles(next)
      setCoverIndex(cover)
    },
    progress,
    failure,
    /** Set once the record exists and only the photos are outstanding. */
    savedId: entityId,
    retry: () => entityId !== undefined && void send(entityId),
    skip: () => entityId !== undefined && router.push(nextHref(entityId)),
  }
}
