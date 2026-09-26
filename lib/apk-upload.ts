import { mkdir, open, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'

import { apkPath } from '@/lib/android-app'
import { MAX_APK_BYTES, publishApk } from '@/lib/apk-store'

/**
 * Chunked upload of the APK from the admin page. The browser sends the file in small pieces because
 * the server's proxy refuses one big request (~100 MB). Pieces are appended in order to a temporary
 * `upload-<id>.part` next to the APK; `completeUpload` then checks and publishes it.
 */

export const CHUNK_BYTES = 8 * 1024 * 1024
const ID = /^[a-f0-9-]{36}$/
const STALE_MS = 24 * 60 * 60 * 1000

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409,
    readonly received?: number,
  ) {
    super(message)
  }
}

const partPath = (id: string) =>
  path.join(path.dirname(apkPath()), `upload-${id}.part`)

function checkId(id: string | null): string {
  if (!id || !ID.test(id)) throw new UploadError('Bad upload id.', 400)
  return id
}

async function sizeOf(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size
  } catch {
    return null
  }
}

/** Remove half-finished uploads that were abandoned. */
async function sweepStale(dir: string): Promise<void> {
  try {
    for (const name of await readdir(dir)) {
      if (!/^upload-.*\.part$/.test(name)) continue
      const file = path.join(dir, name)
      const info = await stat(file)
      if (Date.now() - info.mtimeMs > STALE_MS) await rm(file, { force: true })
    }
  } catch {
    // best effort
  }
}

/** Append one piece. It must start exactly where the last one ended (offset 0 starts over). */
export async function appendChunk(
  uploadId: string | null,
  offset: number,
  chunk: Buffer,
): Promise<number> {
  const id = checkId(uploadId)
  if (!Number.isInteger(offset) || offset < 0)
    throw new UploadError('Bad offset.', 400)
  if (chunk.length === 0 || chunk.length > CHUNK_BYTES) {
    throw new UploadError('Bad chunk size.', 400)
  }
  if (offset + chunk.length > MAX_APK_BYTES) {
    throw new UploadError('The file is too large.', 400)
  }

  const file = partPath(id)
  await mkdir(path.dirname(file), { recursive: true })
  if (offset === 0) {
    await sweepStale(path.dirname(file))
    await rm(file, { force: true })
  }
  const have = (await sizeOf(file)) ?? 0
  if (have !== offset) {
    throw new UploadError('Chunk out of order.', 409, have)
  }

  const handle = await open(file, 'a')
  try {
    await handle.write(chunk)
  } finally {
    await handle.close()
  }
  return offset + chunk.length
}

/** Check the assembled file and make it the published APK. */
export async function completeUpload(
  uploadId: string | null,
  totalBytes: number,
  info: { version: string | null; uploadedBy: string | null },
): Promise<{ bytes: number }> {
  const id = checkId(uploadId)
  const file = partPath(id)
  const have = await sizeOf(file)
  if (have === null) throw new UploadError('Nothing was uploaded.', 400)
  if (have !== totalBytes) {
    throw new UploadError(
      'The upload is incomplete. Please try again.',
      409,
      have,
    )
  }
  try {
    await publishApk(file, {
      buildId: `upload-${id}`,
      version: info.version,
      buildNumber: null,
      commit: null,
      publishedAt: new Date().toISOString(),
      source: 'upload',
      uploadedBy: info.uploadedBy,
    })
  } catch (error) {
    await rm(file, { force: true })
    throw new UploadError(
      error instanceof Error ? error.message : 'Could not publish the file.',
      400,
    )
  }
  return { bytes: have }
}
