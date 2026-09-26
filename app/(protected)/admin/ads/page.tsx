import type { Metadata } from 'next'
import Link from 'next/link'

import { AdList } from '@/components/admin/ad-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { requireArea } from '@/lib/auth/dal'
import {
  ADMIN_TOOLS_SETUP_MESSAGE,
  isAdminToolsSetupProblem,
} from '@/lib/db-errors'
import { listAdsForAdmin } from '@/services/ads.service'

export const metadata: Metadata = { title: 'Portal ads' }
export const dynamic = 'force-dynamic'

export default async function AdminAdsPage() {
  await requireArea('superadmin')
  let ads: Awaited<ReturnType<typeof listAdsForAdmin>> = []
  let needsSetup = false
  try {
    ads = await listAdsForAdmin()
  } catch (error) {
    if (!isAdminToolsSetupProblem(error)) throw error
    needsSetup = true
  }

  return (
    <div className="space-y-4">
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to admin
      </Link>
      <PageHeader
        title="Portal ads"
        subtitle="Banners shown at the top of the tenant, landlord and caretaker dashboards. Pick who sees each one and when it runs."
        actions={
          !needsSetup && (
            <Button asChild>
              <Link href="/admin/ads/new">New ad</Link>
            </Button>
          )
        }
      />
      {needsSetup ? (
        <Alert>
          <AlertDescription>{ADMIN_TOOLS_SETUP_MESSAGE}</AlertDescription>
        </Alert>
      ) : (
        <AdList ads={ads} />
      )}
    </div>
  )
}
