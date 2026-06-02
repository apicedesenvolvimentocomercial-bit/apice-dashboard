import type { Metadata } from 'next'
import { Suspense } from 'react'

import { PeriodFilter } from '@/components/dashboard/period-filter'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminDashboard } from '@/modules/dashboard/admin-dashboard'
import { ConsolidatedDre } from '@/modules/financial/consolidated-dre'
import { getAdminDashboard } from '@/server/queries/dashboard-queries'
import { parsePeriodParam } from '@/server/services/kpi'

export const metadata: Metadata = { title: 'Dashboard' }

type DashboardSearchParams = {
  period?: string
  from?: string
  to?: string
}
type Props = { searchParams: Promise<DashboardSearchParams> }

export default async function DashboardPage({ searchParams }: Props) {
  const sp = await searchParams
  const period = parsePeriodParam(sp.period)
  const from = typeof sp.from === 'string' ? sp.from : undefined
  const to = typeof sp.to === 'string' ? sp.to : undefined

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Visão executiva consolidada de todas as clínicas</p>
        </div>
        <PeriodFilter />
      </div>

      <Suspense key={`${period}-${from ?? ''}-${to ?? ''}`} fallback={<DashboardSkeleton />}>
        <DashboardContent period={period} from={from} to={to} />
      </Suspense>

      <section className="space-y-3 pt-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">DRE Consolidada</h2>
          <p className="text-sm text-muted-foreground">
            Resultado de todas as clínicas somado, em regime de competência.
          </p>
        </div>
        <ConsolidatedDre />
      </section>
    </div>
  )
}

async function DashboardContent({
  period,
  from,
  to,
}: {
  period: ReturnType<typeof parsePeriodParam>
  from?: string
  to?: string
}) {
  const data = await getAdminDashboard(period, from, to)

  if (data.global.totalClinics === 0 && data.clinicsRanking.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">
          Cadastre sua primeira clínica para ver os dados aqui.
        </p>
      </div>
    )
  }

  return <AdminDashboard data={data} />
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
    </div>
  )
}
