import { NextResponse } from 'next/server'

import { requireArea } from '@/lib/auth/dal'
import { ServiceError } from '@/services/errors'
import {
  exportLandlordCsv,
  LANDLORD_EXPORT_KINDS,
  type LandlordExportKind,
} from '@/services/landlord-reports.service'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  await requireArea('landlord', 'superadmin')
  const params = new URL(request.url).searchParams
  const kind = params.get('kind') as LandlordExportKind | null
  if (!kind || !LANDLORD_EXPORT_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Unknown report.' }, { status: 400 })
  }
  try {
    const { filename, csv } = await exportLandlordCsv(kind, {
      from: params.get('from') || undefined,
      to: params.get('to') || undefined,
    })
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'validation') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[landlord/reports] export failed:', error)
    return NextResponse.json(
      { error: 'Could not build the export.' },
      { status: 500 },
    )
  }
}
