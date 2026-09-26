import { createHmac, timingSafeEqual } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import {
  copyFile,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import {
  apkMetaPath,
  apkPath,
  readApkMeta,
  sharedDir,
  type ApkMeta,
} from '@/lib/android-app'

/**
 * Publishes the Android app automatically. Expo calls `/api/eas/webhook` when a build finishes; if it
 * is a finished Android "preview" build of this app, the server downloads the APK and swaps it in as
 * the file behind the landing page's download button.
 */

const APP_ID = 'com.mybalai.app'
const MAX_APK_BYTES = 250 * 1024 * 1024
const MIN_APK_BYTES = 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

export type ApkRelease = {
  buildId: string
  url: string
  version: string | null
  buildNumber: string | null
  commit: string | null
}

/** The shared secret Expo signs webhooks with: env var, or a file in the server's shared folder. */
export async function getWebhookSecret(): Promise<string | null> {
  const fromEnv = process.env.EAS_WEBHOOK_SECRET?.trim()
  if (fromEnv) return fromEnv
  const file =
    process.env.EAS_WEBHOOK_SECRET_FILE ??
    path.join(sharedDir(), 'eas-webhook-secret')
  try {
    return (await readFile(file, 'utf8')).trim() || null
  } catch {
    return null
  }
}

/** Expo sends `Expo-Signature: sha1=<hex HMAC-SHA1 of the raw body>`. */
export function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header?.startsWith('sha1=')) return false
  const expected = createHmac('sha1', secret).update(rawBody).digest()
  const given = Buffer.from(header.slice(5), 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : null

/** The release to publish, or null when this event is not a finished preview APK of this app. */
export function releaseFromPayload(payload: unknown): ApkRelease | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as {
    id?: unknown
    platform?: unknown
    status?: unknown
    metadata?: Record<string, unknown> | null
    artifacts?: { buildUrl?: unknown } | null
  }
  if (p.platform !== 'android' || p.status !== 'finished') return null
  const meta = p.metadata ?? {}
  if (meta.buildProfile !== 'preview') return null
  if (meta.appIdentifier && meta.appIdentifier !== APP_ID) return null

  const buildId = asString(p.id)
  const raw = asString(p.artifacts?.buildUrl)
  if (!buildId || !raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const expoHost =
    url.hostname === 'expo.dev' || url.hostname.endsWith('.expo.dev')
  if (
    url.protocol !== 'https:' ||
    !expoHost ||
    !url.pathname.endsWith('.apk')
  ) {
    return null
  }
  return {
    buildId,
    url: url.toString(),
    version: asString(meta.appVersion),
    buildNumber: asString(meta.appBuildVersion),
    commit: asString(meta.gitCommitHash),
  }
}

// One install at a time: Expo may retry a delivery while the first is still downloading.
let running: Promise<unknown> = Promise.resolve()

/** Download the build and swap it in atomically. `unchanged` when this build is already published. */
export function installRelease(
  release: ApkRelease,
  fetchImpl: typeof fetch = fetch,
): Promise<'installed' | 'unchanged'> {
  const job = running.then(() => install(release, fetchImpl))
  running = job.catch(() => undefined)
  return job
}

async function install(
  release: ApkRelease,
  fetchImpl: typeof fetch,
): Promise<'installed' | 'unchanged'> {
  const target = apkPath()
  const part = `${target}.part`

  const current = await readApkMeta()
  if (current?.buildId === release.buildId) return 'unchanged'

  try {
    const res = await fetchImpl(release.url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`)

    let received = 0
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        received += chunk.length
        if (received > MAX_APK_BYTES) done(new Error('APK is too large'))
        else done(null, chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
      limit,
      createWriteStream(part),
    )
    if (received < MIN_APK_BYTES)
      throw new Error('downloaded file is too small')

    // An APK is a zip: it must start with "PK\x03\x04".
    const handle = await open(part, 'r')
    const magic = Buffer.alloc(4)
    await handle.read(magic, 0, 4, 0)
    await handle.close()
    if (magic.toString('latin1') !== 'PK\x03\x04') throw new Error('not an APK')

    // Keep the previous file for a quick manual rollback, then swap the new one in atomically.
    await copyFile(target, `${target}.previous`).catch(() => undefined)
    await rename(part, target)
    const meta: ApkMeta = {
      buildId: release.buildId,
      version: release.version,
      buildNumber: release.buildNumber,
      commit: release.commit,
      publishedAt: new Date().toISOString(),
    }
    await writeFile(apkMetaPath(), JSON.stringify(meta, null, 2))
    return 'installed'
  } finally {
    await rm(part, { force: true })
  }
}
