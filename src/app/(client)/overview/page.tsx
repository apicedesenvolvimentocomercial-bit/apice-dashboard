import type { Metadata } from 'next'
import { Suspense } from 'react'

import { PeriodFilter } from '@/components/dashboard/period-filter'
import { Skeleton } from '@/components/ui/skeleton'
import { ClinicDashboard } from '@/modules/dashboard/clinic-dashboard'
import { auth } from '@/server/auth'
import { getClient } from '@/server/queries/client-queries'
import { getClinicDashboard } from '@/server/queries/dashboard-queries'
import { parsePeriodParam } from '@/server/services/kpi'

export const metadata: Metadata = { title: 'Dashboard' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props = { searchParams: Promise<any> }

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

  const sp = (await searchParams) as Record<string, string | undefined>
  const period = parsePeriodParam(sp.period)
  const from = typeof sp.from === 'string' ? sp.from : undefined
  const to = typeof sp.to === 'string' ? sp.to : undefined

  const client = await getClient(clientId)

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
        <Content clientId={clientId} period={period} from={from} to={to} />
      </Suspense>
    </div>
  )
}

async function Content({
  clientId,
  period,
  from,
  to,
}: {
  clientId: string
  period: ReturnType<typeof parsePeriodParam>
  from?: string
  to?: string
}) {
  const data = await getClinicDashboard(clientId, period, from, to)
  return <ClinicDashboard data={data} />
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
