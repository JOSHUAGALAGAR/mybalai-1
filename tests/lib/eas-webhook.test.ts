import { createHmac } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  installRelease,
  releaseFromPayload,
  verifySignature,
} from '@/lib/eas-webhook'

const build = (over: Record<string, unknown> = {}) => ({
  id: 'b-123',
  platform: 'android',
  status: 'finished',
  artifacts: { buildUrl: 'https://expo.dev/artifacts/eas/abc.apk' },
  metadata: {
    buildProfile: 'preview',
    appIdentifier: 'com.mybalai.app',
    appVersion: '1.0.0',
    appBuildVersion: '7',
    gitCommitHash: 'abc1234',
  },
  ...over,
})

describe('verifySignature', () => {
  const secret = 's3cret'
  const body = '{"a":1}'
  const good = `sha1=${createHmac('sha1', secret).update(body).digest('hex')}`

  it('accepts Expo’s HMAC-SHA1 signature', () => {
    expect(verifySignature(body, good, secret)).toBe(true)
  })
  it('rejects a wrong secret, a changed body, and a missing or malformed header', () => {
    expect(verifySignature(body, good, 'other')).toBe(false)
    expect(verifySignature(`${body} `, good, secret)).toBe(false)
    expect(verifySignature(body, null, secret)).toBe(false)
    expect(verifySignature(body, 'sha1=zz', secret)).toBe(false)
    expect(verifySignature(body, good.replace('sha1=', ''), secret)).toBe(false)
  })
})

describe('releaseFromPayload', () => {
  it('takes a finished Android preview build of this app', () => {
    expect(releaseFromPayload(build())).toEqual({
      buildId: 'b-123',
      url: 'https://expo.dev/artifacts/eas/abc.apk',
      version: '1.0.0',
      buildNumber: '7',
      commit: 'abc1234',
    })
  })

  it.each([
    ['an iOS build', { platform: 'ios' }],
    ['an unfinished build', { status: 'errored' }],
    ['a production build', { metadata: { buildProfile: 'production' } }],
    [
      'another app',
      { metadata: { buildProfile: 'preview', appIdentifier: 'com.other.app' } },
    ],
    [
      'an artifact that is not on expo.dev',
      { artifacts: { buildUrl: 'https://evil.example/x.apk' } },
    ],
    [
      'a look-alike host',
      { artifacts: { buildUrl: 'https://expo.dev.evil.example/x.apk' } },
    ],
    ['plain http', { artifacts: { buildUrl: 'http://expo.dev/x.apk' } }],
    ['an app bundle', { artifacts: { buildUrl: 'https://expo.dev/x.aab' } }],
    ['no artifact', { artifacts: null }],
  ])('ignores %s', (_name, over) => {
    expect(releaseFromPayload(build(over))).toBeNull()
  })

  it('ignores junk', () => {
    expect(releaseFromPayload(null)).toBeNull()
    expect(releaseFromPayload('x')).toBeNull()
  })
})

describe('installRelease', () => {
  let dir: string
  const apk = () => path.join(dir, 'mybalai.apk')
  const release = {
    buildId: 'b-1',
    url: 'https://expo.dev/artifacts/eas/a.apk',
    version: '1.2.3',
    buildNumber: '9',
    commit: 'c0ffee',
  }
  const zip = (size: number) => {
    const b = Buffer.alloc(size, 1)
    b.write('PK\x03\x04', 0, 'latin1')
    return b
  }
  const serve = (body: Buffer, status = 200) =>
    (async () =>
      new Response(new Uint8Array(body), { status })) as unknown as typeof fetch

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'eas-'))
    process.env.MYBALAI_APK_PATH = apk()
  })
  afterEach(async () => {
    delete process.env.MYBALAI_APK_PATH
    await rm(dir, { recursive: true, force: true })
  })

  it('installs the APK, keeps the previous one, and records the build', async () => {
    await writeFile(apk(), zip(2 * 1024 * 1024))
    const result = await installRelease(release, serve(zip(3 * 1024 * 1024)))
    expect(result).toBe('installed')
    expect((await stat(apk())).size).toBe(3 * 1024 * 1024)
    expect((await stat(`${apk()}.previous`)).size).toBe(2 * 1024 * 1024)
    const meta = JSON.parse(await readFile(`${apk()}.json`, 'utf8'))
    expect(meta).toMatchObject({
      buildId: 'b-1',
      version: '1.2.3',
      buildNumber: '9',
    })
  })

  it('does nothing when that build is already published', async () => {
    await installRelease(release, serve(zip(2 * 1024 * 1024)))
    const again = await installRelease(release, serve(zip(5 * 1024 * 1024)))
    expect(again).toBe('unchanged')
    expect((await stat(apk())).size).toBe(2 * 1024 * 1024)
  })

  it('keeps the current APK when the download is bad', async () => {
    await writeFile(apk(), zip(2 * 1024 * 1024))
    await expect(
      installRelease(release, serve(Buffer.alloc(10))),
    ).rejects.toThrow(/small/)
    await expect(
      installRelease(
        { ...release, buildId: 'b-2' },
        serve(Buffer.alloc(2 * 1024 * 1024, 7)),
      ),
    ).rejects.toThrow(/not an APK/)
    await expect(
      installRelease(
        { ...release, buildId: 'b-3' },
        serve(zip(2 * 1024 * 1024), 404),
      ),
    ).rejects.toThrow(/404/)
    expect((await stat(apk())).size).toBe(2 * 1024 * 1024)
    await expect(stat(`${apk()}.part`)).rejects.toThrow()
  })
})
