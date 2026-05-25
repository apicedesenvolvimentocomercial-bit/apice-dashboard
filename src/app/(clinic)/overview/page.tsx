import type { Metadata } from 'next'
import { Suspense } from 'react'

import { PeriodFilter } from '@/components/dashboard/period-filter'
import { Skeleton } from '@/components/ui/skeleton'
import { ClinicDashboard } from '@/modules/dashboard/clinic-dashboard'
import {
  getClinicProfile,
  getClinicOverviewDashboard,
} from '@/domains/clinic/dashboard/dashboard-queries'
import { auth } from '@/server/auth'
import { getClinicContext } from '@/server/auth/clinic-context'
import { resolveDashboardVisibility } from '@/server/auth/dashboard-visibility'
import { parsePeriodParam } from '@/server/services/kpi'

export const metadata: Metadata = { title: 'Dashboard' }

type DashboardSearchParams = { period?: string; from?: string; to?: string }
type Props = { searchParams: Promise<DashboardSearchParams> }

export default async function ClientOverviewPage({ searchParams }: Props) {
  const session = await auth()
  const clientId = session?.user?.clientId

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  const sp = await searchParams
  const period = parsePeriodParam(sp.period)
  const from = typeof sp.from === 'string' ? sp.from : undefined
  const to = typeof sp.to === 'string' ? sp.to : undefined

  const client = await getClinicProfile()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{client?.name ?? 'Sua clínica'}</h1>
          <p className="text-muted-foreground">Visão geral da sua clínica</p>
        </div>
        <PeriodFilter />
      </div>

      <Suspense
        key={`${clientId}-${period}-${from ?? ''}-${to ?? ''}`}
        fallback={<ClinicSkeleton />}
      >
        <Content period={period} from={from} to={to} />
      </Suspense>
    </div>
  )
}

async function Content({
  period,
  from,
  to,
}: {
  period: ReturnType<typeof parsePeriodParam>
  from?: string
  to?: string
}) {
  const [data, ctx] = await Promise.all([
    getClinicOverviewDashboard(period, from, to),
    getClinicContext(),
  ])
  const visibility = await resolveDashboardVisibility(ctx)
  return <ClinicDashboard data={data} visibility={visibility} />
}

function ClinicSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}
