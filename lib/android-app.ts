import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

/**
 * The Android app (an APK built by EAS) is not committed to git. It lives on the server in
 * `shared/downloads/`, next to the secrets file, so it survives deploys: every release is a fresh
 * folder under `releases/`, two levels below `shared/`. Override with MYBALAI_APK_PATH.
 */
export const APK_DOWNLOAD_NAME = 'MyBalai.apk'

export function apkPath(): string {
  return (
    process.env.MYBALAI_APK_PATH ??
    path.join(sharedDir(), 'downloads', 'mybalai.apk')
  )
}

/** Where the APK, its notes file and the webhook secret live: the server's `shared/` folder. */
export function sharedDir(): string {
  return path.resolve(process.cwd(), '..', '..', 'shared')
}

/** Details of the published build, written next to the APK when it is installed from an Expo build. */
export type ApkMeta = {
  buildId: string
  version: string | null
  buildNumber: string | null
  commit: string | null
  publishedAt: string
  /** Where it came from: an Expo build (webhook) or a file an admin uploaded. */
  source?: 'expo' | 'upload'
  uploadedBy?: string | null
}

export function apkMetaPath(): string {
  return `${apkPath()}.json`
}

export async function readApkMeta(): Promise<ApkMeta | null> {
  try {
    const parsed = JSON.parse(await readFile(apkMetaPath(), 'utf8')) as ApkMeta
    return typeof parsed.buildId === 'string' ? parsed : null
  } catch {
    return null
  }
}

export type AndroidApp = {
  path: string
  bytes: number
  updatedAt: Date
  version: string | null
}

/** The published APK, or null when none has been uploaded yet (the page then says "coming soon"). */
export async function getAndroidApp(): Promise<AndroidApp | null> {
  const file = apkPath()
  try {
    const info = await stat(file)
    if (!info.isFile() || info.size === 0) return null
    const meta = await readApkMeta()
    return {
      path: file,
      bytes: info.size,
      updatedAt: info.mtime,
      version: meta?.version ?? null,
    }
  } catch {
    return null
  }
}

export function formatMegabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`
}

/** "bytes=start-end" -> inclusive byte range, or null when absent/unsatisfiable (then send it all). */
export function parseRange(header: string | null, size: number) {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (match[1] === '' && match[2] === '')) return null
  let start: number
  let end: number
  if (match[1] === '') {
    // suffix range: the last N bytes
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  return start <= end && start < size ? { start, end } : null
}
