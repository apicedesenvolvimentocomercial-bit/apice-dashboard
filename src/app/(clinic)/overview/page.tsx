import type { Metadata } from 'next'
import { Suspense } from 'react'

import { PeriodBar } from '@/components/clinic/dashboard/period-bar'
import { ClinicDashboard } from '@/modules/dashboard/clinic-dashboard'
import { getClinicOverviewDashboard } from '@/domains/clinic/dashboard/dashboard-queries'
import { auth } from '@/server/auth'
import { getClinicContext } from '@/server/auth/clinic-context'
import { resolveDashboardVisibility } from '@/server/auth/dashboard-visibility'
import { parsePeriodParam } from '@/server/services/kpi'

export const metadata: Metadata = { title: 'Dashboard' }

type DashboardSearchParams = { period?: string; from?: string; to?: string }
type Props = { searchParams: Promise<DashboardSearchParams> }

/**
 * Dashboard da clínica — redesign Senno. O título ("Visão geral") vive no
 * topbar do chrome; o corpo abre com a barra de período centralizada
 * (handoff §1/§4) seguida dos setores de KPI e widgets.
 */
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

  return (
    <div className="flex flex-col gap-[18px]">
      <PeriodBar />

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

/** Skeleton do redesign: shimmer (nunca spinner), espelhando o layout real. */
function ClinicSkeleton() {
  return (
    <div className="flex flex-col gap-[18px]">
      {[0, 1, 2].map((sec) => (
        <div key={sec}>
          <div className="senno-shimmer mb-2.5 ml-0.5 h-3 w-40 rounded-md" />
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(228px,1fr))]">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-[13px] border border-border bg-card p-[18px] shadow-card"
              >
                <div className="senno-shimmer h-[13px] w-24 rounded-md" />
                <div className="senno-shimmer h-7 w-36 rounded-[7px]" />
                <div className="senno-shimmer h-[13px] w-28 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.7fr_1fr]">
        <div className="senno-shimmer h-[320px] rounded-[13px]" />
        <div className="senno-shimmer h-[320px] rounded-[13px]" />
      </div>
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1fr_1.6fr]">
        <div className="senno-shimmer h-[220px] rounded-[13px]" />
        <div className="senno-shimmer h-[220px] rounded-[13px]" />
      </div>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-[0.95fr_0.9fr_1.55fr]">
        <div className="senno-shimmer h-[280px] rounded-[13px]" />
        <div className="senno-shimmer h-[280px] rounded-[13px]" />
        <div className="senno-shimmer h-[280px] rounded-[13px]" />
      </div>
    </div>
  )
}
