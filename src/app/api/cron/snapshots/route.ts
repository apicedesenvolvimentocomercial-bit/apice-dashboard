import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { runSnapshotsJob } from '@/server/jobs/snapshots-job'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization')
  if (header === `Bearer ${secret}`) return true
  if (header === secret) return true
  return false
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runSnapshotsJob()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error('Snapshots cron failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ ok: false, error: 'job_failed' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}
