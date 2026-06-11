import { NextResponse } from 'next/server'

import { isCronAuthorized } from '@/lib/cron-auth'
import { logger } from '@/lib/logger'
import { runFinancialNotificationsJob } from '@/server/jobs/financial-notifications-job'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runFinancialNotificationsJob()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error('Financial notifications cron failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ ok: false, error: 'job_failed' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}
