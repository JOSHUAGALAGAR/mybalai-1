import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { formatMegabytes, getAndroidApp, parseRange } from '@/lib/android-app'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'apk-'))
})
afterEach(async () => {
  delete process.env.MYBALAI_APK_PATH
  await rm(dir, { recursive: true, force: true })
})

describe('getAndroidApp', () => {
  it('is null when no APK has been uploaded', async () => {
    process.env.MYBALAI_APK_PATH = path.join(dir, 'missing.apk')
    expect(await getAndroidApp()).toBeNull()
  })

  it('is null for an empty file', async () => {
    const file = path.join(dir, 'empty.apk')
    await writeFile(file, '')
    process.env.MYBALAI_APK_PATH = file
    expect(await getAndroidApp()).toBeNull()
  })

  it('returns the file size when the APK is there', async () => {
    const file = path.join(dir, 'app.apk')
    await writeFile(file, Buffer.alloc(2048))
    process.env.MYBALAI_APK_PATH = file
    expect(await getAndroidApp()).toMatchObject({ path: file, bytes: 2048 })
  })
})

describe('formatMegabytes', () => {
  it('rounds to whole megabytes, at least 1', () => {
    expect(formatMegabytes(500)).toBe('1 MB')
    expect(formatMegabytes(68 * 1024 * 1024 + 300_000)).toBe('68 MB')
  })
})

describe('parseRange', () => {
  it('reads start-end, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
  })

  it('sends the whole file for a missing or unusable range', () => {
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('bytes=2000-3000', 1000)).toBeNull()
    expect(parseRange('bytes=50-10', 1000)).toBeNull()
    expect(parseRange('items=0-1', 1000)).toBeNull()
  })
})
