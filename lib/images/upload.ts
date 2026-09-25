/**
 * Browser-side upload orchestration. Pure (the server calls and the actual file transfer are
 * injected), so it is easy to test and the real wiring lives in the components.
 *
 *   1. ask the server for one-time upload links (it validates the files and checks ownership)
 *   2. send each file straight to Storage (a few at a time)
 *   3. tell the server which files arrived, and which is the cover
 */
import { validateBatch, type ImageTarget } from '@/lib/images/rules'

export type Outcome<T> = { ok: true; data: T } | { ok: false; message: string }

export type GalleryImage = {
  imageId: number
  url: string
  isCover: boolean
  originalFilename: string | null
}

export type ImageApi = {
  prepare: (
    target: ImageTarget,
    files: { name: string; type: string; size: number }[],
  ) => Promise<
    Outcome<{ uploads: { path: string; token: string; index: number }[] }>
  >
  register: (
    target: ImageTarget,
    files: { path: string; name: string; type: string; size: number }[],
    coverPath?: string,
  ) => Promise<Outcome<GalleryImage[]>>
  setCover: (
    target: ImageTarget,
    imageId: number,
  ) => Promise<Outcome<GalleryImage[]>>
  remove: (
    target: ImageTarget,
    imageId: number,
  ) => Promise<Outcome<GalleryImage[]>>
}

export type UploadFile = (
  path: string,
  token: string,
  file: File,
) => Promise<{ ok: true } | { ok: false; message: string }>

export type UploadResult =
  { ok: true; images: GalleryImage[] } | { ok: false; message: string }

const CONCURRENCY = 3

/** Run `worker` over `items`, at most `limit` at a time, preserving order in the result. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

export async function uploadImages(opts: {
  target: ImageTarget
  files: File[]
  /** Index in `files` of the photo to make the cover (optional). */
  coverIndex?: number
  /** How many photos the target already has (for the limit check). */
  existingCount?: number
  api: Pick<ImageApi, 'prepare' | 'register'>
  uploadFile: UploadFile
  onProgress?: (done: number, total: number) => void
}): Promise<UploadResult> {
  const { target, files, api, uploadFile } = opts

  // Fail fast in the browser; the server checks again.
  const early = validateBatch(target, opts.existingCount ?? 0, files)
  if (early) return { ok: false, message: early }

  const prepared = await api.prepare(
    target,
    files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
  )
  if (!prepared.ok) return prepared

  let done = 0
  opts.onProgress?.(0, files.length)
  const sent = await mapLimit(prepared.data.uploads, CONCURRENCY, async (u) => {
    const file = files[u.index]
    const result = await uploadFile(u.path, u.token, file)
    if (result.ok) opts.onProgress?.(++done, files.length)
    return { u, file, result }
  })

  const failed = sent.filter((s) => !s.result.ok)
  if (failed.length > 0) {
    // Nothing is recorded, so the server never lists a photo that isn't there.
    return {
      ok: false,
      message:
        failed.length === files.length
          ? 'The upload failed. Check your connection and try again.'
          : `${failed.length} of ${files.length} photos failed to upload. Nothing was saved — please try again.`,
    }
  }

  const coverFile =
    opts.coverIndex != null
      ? sent.find((s) => s.u.index === opts.coverIndex)
      : undefined
  const registered = await api.register(
    target,
    sent.map((s) => ({
      path: s.u.path,
      name: s.file.name,
      type: s.file.type,
      size: s.file.size,
    })),
    coverFile?.u.path,
  )
  return registered.ok ? { ok: true, images: registered.data } : registered
}
