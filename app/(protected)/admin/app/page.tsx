import type { Metadata } from 'next'
import Link from 'next/link'

import { ApkUpload } from '@/components/admin/apk-upload'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatMegabytes, getAndroidApp, readApkMeta } from '@/lib/android-app'
import { requireArea } from '@/lib/auth/dal'
import { getWebhookSecret } from '@/lib/eas-webhook'
import { getDownloadStats } from '@/services/downloads.service'

export const metadata: Metadata = { title: 'Android app' }
export const dynamic = 'force-dynamic'

const when = (iso: string | Date) =>
  new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

export default async function AdminAppPage() {
  await requireArea('superadmin')
  const [app, meta, stats, secret] = await Promise.all([
    getAndroidApp(),
    readApkMeta(),
    getDownloadStats().catch(() => null),
    getWebhookSecret(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Android app"
        subtitle="The APK behind the “Download for Android” button on the landing page."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/" target="_blank">
              View landing page
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Published now</CardTitle>
        </CardHeader>
        <CardContent>
          {app ? (
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Row
                label="Version"
                value={app.version ? `v${app.version}` : 'Not set'}
              />
              <Row label="Size" value={formatMegabytes(app.bytes)} />
              <Row
                label="Published"
                value={when(meta?.publishedAt ?? app.updatedAt)}
              />
              <Row
                label="Source"
                value={
                  meta?.source === 'upload'
                    ? `Uploaded by ${meta.uploadedBy ?? 'an admin'}`
                    : meta?.source === 'expo'
                      ? 'Expo build (automatic)'
                      : 'Uploaded by hand'
                }
              />
              {meta?.commit && (
                <Row label="Code version" value={meta.commit.slice(0, 7)} />
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing is published yet, so the landing page shows “Android app —
              coming soon”. Upload an APK below.
            </p>
          )}
        </CardContent>
      </Card>

      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Downloads</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Stat label="All time" value={stats.total} />
            <Stat label="Last 30 days" value={stats.last30Days} />
            <Stat label="Last 7 days" value={stats.last7Days} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a new version</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose the <strong>.apk</strong> from an Expo “preview” build. It
            replaces the current file right away and the landing page offers it
            to everyone. The previous file is kept on the server for a quick
            rollback.
          </p>
          <ApkUpload />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Automatic updates from Expo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Every finished Android <strong>preview</strong> build on Expo is
            published here automatically, with no upload needed. Production
            (Play Store) builds are ignored.
          </p>
          <p>
            Status:{' '}
            <span
              className={
                secret
                  ? 'font-medium text-foreground'
                  : 'font-medium text-destructive'
              }
            >
              {secret
                ? 'connected'
                : 'not connected (the webhook secret is missing on the server)'}
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
