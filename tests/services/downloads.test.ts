import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/repositories/app-downloads.repository', () => ({
  insertAppDownload: vi.fn().mockResolvedValue(undefined),
  countAppDownloads: vi.fn(),
}))

const repo = await import('@/repositories/app-downloads.repository')
const { recordAppDownload, getDownloadStats } = await import(
  '@/services/downloads.service'
)

const CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordAppDownload', () => {
  it('counts a download from the start of the file', async () => {
    await recordAppDownload({ userAgent: CHROME, startsAtBeginning: true })
    expect(repo.insertAppDownload).toHaveBeenCalledWith('android')
  })

  it('does not count a resumed or ranged request', async () => {
    await recordAppDownload({ userAgent: CHROME, startsAtBeginning: false })
    expect(repo.insertAppDownload).not.toHaveBeenCalled()
  })

  it.each(['Googlebot/2.1', 'facebookexternalhit/1.1', 'Slackbot-LinkExpanding'])(
    'ignores automated fetchers (%s)',
    async (userAgent) => {
      await recordAppDownload({ userAgent, startsAtBeginning: true })
      expect(repo.insertAppDownload).not.toHaveBeenCalled()
    },
  )

  it('never throws when the table is missing', async () => {
    vi.mocked(repo.insertAppDownload).mockRejectedValueOnce(new Error('no table'))
    await expect(
      recordAppDownload({ userAgent: CHROME, startsAtBeginning: true }),
    ).resolves.toBeUndefined()
  })
})

describe('getDownloadStats', () => {
  it('returns all-time, 30-day and 7-day counts', async () => {
    vi.mocked(repo.countAppDownloads).mockImplementation(async (since) =>
      since === undefined ? 40 : new Date(since).getUTCDate() === 19 ? 3 : 12,
    )
    const stats = await getDownloadStats(new Date('2026-09-26T00:00:00Z'))
    expect(stats).toEqual({ total: 40, last30Days: 12, last7Days: 3 })
  })
})
