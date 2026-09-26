import { NextResponse } from 'next/server'

import { requireArea } from '@/lib/auth/dal'
import {
  EXPORT_KINDS,
  exportReportCsv,
  type ExportKind,
} from '@/services/reports.service'
import { ServiceError } from '@/services/errors'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  await requireArea('superadmin')
  const params = new URL(request.url).searchParams
  const kind = params.get('kind') as ExportKind | null
  if (!kind || !EXPORT_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Unknown report.' }, { status: 400 })
  }
  try {
    const { filename, csv } = await exportReportCsv(kind, {
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
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
    console.error('[reports] export failed:', error)
    return NextResponse.json(
      { error: 'Could not build the export.' },
      { status: 500 },
    )
  }
}
