import { describe, expect, it, vi } from 'vitest'

import { mapLimit, uploadImages, type ImageApi } from '@/lib/images/upload'
import { MAX_IMAGE_BYTES } from '@/lib/images/rules'

const property = { kind: 'property', propertyId: 12 } as const
const file = (
  name: string,
  over: Partial<{ type: string; size: number }> = {},
) => ({ name, type: 'image/jpeg', size: 1000, ...over }) as File

function api(over: Partial<ImageApi> = {}) {
  return {
    prepare: vi.fn(async (_t, files) => ({
      ok: true as const,
      data: {
        uploads: files.map((_f: unknown, index: number) => ({
          path: `properties/12/p${index}.jpg`,
          token: `t${index}`,
          index,
        })),
      },
    })),
    register: vi.fn(async () => ({
      ok: true as const,
      data: [
        { imageId: 1, url: 'u', isCover: true, originalFilename: 'a.jpg' },
      ],
    })),
    ...over,
  } as unknown as Pick<ImageApi, 'prepare' | 'register'> & {
    prepare: ReturnType<typeof vi.fn>
    register: ReturnType<typeof vi.fn>
  }
}

describe('mapLimit', () => {
  it('runs at most N at a time and keeps result order', async () => {
    let running = 0,
      peak = 0
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      return n * 2
    })
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14])
    expect(peak).toBe(3)
  })
  it('handles an empty list', async () => {
    expect(await mapLimit([], 3, async () => 1)).toEqual([])
  })
})

describe('uploadImages', () => {
  it('asks for links, uploads every file, then registers them with the chosen cover', async () => {
    const a = api()
    const uploadFile = vi.fn(
      async (_path: string, _token: string, _file: File) => ({
        ok: true as const,
      }),
    )
    const progress = vi.fn()
    const result = await uploadImages({
      target: property,
      files: [file('a.jpg'), file('b.jpg'), file('c.jpg')],
      coverIndex: 1,
      api: a,
      uploadFile,
      onProgress: progress,
    })

    expect(result.ok).toBe(true)
    expect(a.prepare).toHaveBeenCalledWith(property, [
      { name: 'a.jpg', type: 'image/jpeg', size: 1000 },
      { name: 'b.jpg', type: 'image/jpeg', size: 1000 },
      { name: 'c.jpg', type: 'image/jpeg', size: 1000 },
    ])
    expect(uploadFile).toHaveBeenCalledTimes(3)
    expect(uploadFile.mock.calls.map((c) => c[1]).sort()).toEqual([
      't0',
      't1',
      't2',
    ])
    const [, registered, cover] = a.register.mock.calls[0]
    expect(registered.map((r: { path: string }) => r.path)).toEqual([
      'properties/12/p0.jpg',
      'properties/12/p1.jpg',
      'properties/12/p2.jpg',
    ])
    expect(cover).toBe('properties/12/p1.jpg')
    expect(progress).toHaveBeenLastCalledWith(3, 3)
  })

  it('registers with no explicit cover when none is chosen', async () => {
    const a = api()
    await uploadImages({
      target: property,
      files: [file('a.jpg')],
      api: a,
      uploadFile: async () => ({ ok: true }),
    })
    expect(a.register.mock.calls[0][2]).toBeUndefined()
  })

  it('validates in the browser first and never contacts the server for bad files', async () => {
    const a = api()
    const bad = await uploadImages({
      target: property,
      files: [file('a.gif', { type: 'image/gif' })],
      api: a,
      uploadFile: async () => ({ ok: true }),
    })
    expect(bad).toEqual({
      ok: false,
      message: expect.stringMatching(/JPG, PNG or WebP/),
    })
    const big = await uploadImages({
      target: property,
      files: [file('a.jpg', { size: MAX_IMAGE_BYTES + 1 })],
      api: a,
      uploadFile: async () => ({ ok: true }),
    })
    expect(big.ok).toBe(false)
    const none = await uploadImages({
      target: property,
      files: [],
      api: a,
      uploadFile: async () => ({ ok: true }),
    })
    expect(none.ok).toBe(false)
    expect(a.prepare).not.toHaveBeenCalled()
  })

  it('respects photos already on the property when checking the limit', async () => {
    const a = api()
    const r = await uploadImages({
      target: property,
      files: [file('a.jpg'), file('b.jpg')],
      existingCount: 11,
      api: a,
      uploadFile: async () => ({ ok: true }),
    })
    expect(r).toEqual({
      ok: false,
      message: expect.stringMatching(/1 more photo/),
    })
  })

  it("passes the server's refusal through and uploads nothing", async () => {
    const a = api({
      prepare: vi.fn(async () => ({
        ok: false as const,
        message: 'You do not have permission.',
      })),
    })
    const uploadFile = vi.fn()
    const r = await uploadImages({
      target: property,
      files: [file('a.jpg')],
      api: a,
      uploadFile,
    })
    expect(r).toEqual({ ok: false, message: 'You do not have permission.' })
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('saves NOTHING if any file fails to upload, and says how many failed', async () => {
    const a = api()
    let n = 0
    const r = await uploadImages({
      target: property,
      files: [file('a.jpg'), file('b.jpg'), file('c.jpg')],
      api: a,
      uploadFile: async () =>
        ++n === 2 ? { ok: false, message: 'boom' } : { ok: true },
    })
    expect(r).toEqual({
      ok: false,
      message: expect.stringMatching(/1 of 3 photos failed/),
    })
    expect(a.register).not.toHaveBeenCalled()
  })

  it('reports a clear message when every upload fails', async () => {
    const r = await uploadImages({
      target: property,
      files: [file('a.jpg')],
      api: api(),
      uploadFile: async () => ({ ok: false, message: 'x' }),
    })
    expect(r).toEqual({
      ok: false,
      message: expect.stringMatching(/upload failed/i),
    })
  })

  it("passes a register failure back (e.g. the server's gallery limit)", async () => {
    const a = api({
      register: vi.fn(async () => ({
        ok: false as const,
        message: 'A property can have at most 12 photos.',
      })),
    })
    const r = await uploadImages({
      target: property,
      files: [file('a.jpg')],
      api: a,
      uploadFile: async () => ({ ok: true }),
    })
    expect(r).toEqual({
      ok: false,
      message: 'A property can have at most 12 photos.',
    })
  })
})
