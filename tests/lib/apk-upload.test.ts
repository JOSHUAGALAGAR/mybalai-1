import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { appendChunk, completeUpload, UploadError } from '@/lib/apk-upload'

const ID = '11111111-2222-3333-4444-555555555555'
const MB = 1024 * 1024
const apkBytes = (size: number) => {
  const b = Buffer.alloc(size, 9)
  b.write('PK\x03\x04', 0, 'latin1')
  return b
}

let dir: string
const apk = () => path.join(dir, 'mybalai.apk')
const part = () => path.join(dir, `upload-${ID}.part`)

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'up-'))
  process.env.MYBALAI_APK_PATH = apk()
})
afterEach(async () => {
  delete process.env.MYBALAI_APK_PATH
  await rm(dir, { recursive: true, force: true })
})

async function sendAll(data: Buffer, chunk = 4 * MB) {
  for (let o = 0; o < data.length; o += chunk) {
    await appendChunk(ID, o, data.subarray(o, Math.min(o + chunk, data.length)))
  }
}

describe('chunked upload', () => {
  it('assembles pieces in order and publishes them, keeping the previous APK', async () => {
    await writeFile(apk(), apkBytes(2 * MB))
    const file = apkBytes(10 * MB + 123)
    await sendAll(file)
    const result = await completeUpload(ID, file.length, {
      version: '1.0.1',
      uploadedBy: 'Admin',
    })
    expect(result.bytes).toBe(file.length)
    expect(Buffer.compare(await readFile(apk()), file)).toBe(0)
    expect((await stat(`${apk()}.previous`)).size).toBe(2 * MB)
    expect(JSON.parse(await readFile(`${apk()}.json`, 'utf8'))).toMatchObject({
      version: '1.0.1',
      source: 'upload',
      uploadedBy: 'Admin',
    })
    await expect(stat(part())).rejects.toThrow()
  })

  it('refuses an out-of-order piece and says where to resume', async () => {
    await appendChunk(ID, 0, apkBytes(MB))
    await expect(
      appendChunk(ID, 5 * MB, Buffer.alloc(10)),
    ).rejects.toMatchObject({
      status: 409,
      received: MB,
    })
  })

  it('starts over when the first piece is sent again', async () => {
    await appendChunk(ID, 0, apkBytes(MB))
    await appendChunk(ID, 0, apkBytes(2 * MB))
    await expect(appendChunk(ID, 2 * MB, Buffer.alloc(5))).resolves.toBe(
      2 * MB + 5,
    )
  })

  it('rejects bad ids, offsets and sizes', async () => {
    const bad = (id: string | null, offset: number, size: number) =>
      expect(
        appendChunk(id, offset, Buffer.alloc(size)),
      ).rejects.toBeInstanceOf(UploadError)
    await bad('../../etc/passwd', 0, 1)
    await bad(null, 0, 1)
    await bad(ID, -1, 1)
    await bad(ID, 0, 0)
    await bad(ID, 0, 9 * MB)
  })

  it('refuses to publish an incomplete upload', async () => {
    await appendChunk(ID, 0, apkBytes(2 * MB))
    await expect(
      completeUpload(ID, 3 * MB, { version: null, uploadedBy: null }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a file that is not an APK, and keeps the current one', async () => {
    await writeFile(apk(), apkBytes(2 * MB))
    await appendChunk(ID, 0, Buffer.alloc(2 * MB, 7))
    await expect(
      completeUpload(ID, 2 * MB, { version: null, uploadedBy: null }),
    ).rejects.toThrow(/not an APK/)
    expect((await readFile(apk())).subarray(0, 2).toString()).toBe('PK')
    await expect(stat(part())).rejects.toThrow()
  })
})
