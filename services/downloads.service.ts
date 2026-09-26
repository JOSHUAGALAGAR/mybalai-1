import 'server-only'

import {
  countAppDownloads,
  insertAppDownload,
} from '@/repositories/app-downloads.repository'

const DAY_MS = 24 * 60 * 60 * 1000

// Link previewers and crawlers fetch the file too; they are not people installing the app.
const AUTOMATED = /bot|crawl|spider|preview|facebookexternalhit|slurp/i

export type DownloadStats = { total: number; last7Days: number; last30Days: number }

/**
 * Count one download. Only a request for the start of the file counts (a resumed or ranged request
 * is the same download continuing). Never throws: failing to count must not break the download,
 * e.g. before migration 0025 has been run.
 */
export async function recordAppDownload(input: {
  userAgent: string | null
  startsAtBeginning: boolean
}): Promise<void> {
  if (!input.startsAtBeginning) return
  if (input.userAgent && AUTOMATED.test(input.userAgent)) return
  try {
    await insertAppDownload('android')
  } catch (error) {
    console.error('[downloads] could not record a download', error)
  }
}

export async function getDownloadStats(now = new Date()): Promise<DownloadStats> {
  const since = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString()
  const [total, last7Days, last30Days] = await Promise.all([
    countAppDownloads(),
    countAppDownloads(since(7)),
    countAppDownloads(since(30)),
  ])
  return { total, last7Days, last30Days }
}
