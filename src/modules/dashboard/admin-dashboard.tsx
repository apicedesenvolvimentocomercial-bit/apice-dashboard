import Link from 'next/link'

import { HorizontalBarChart } from '@/components/charts/horizontal-bar-chart'
import { RevenueLineChart } from '@/components/charts/revenue-line-chart'
import { SharePieChart } from '@/components/charts/share-pie-chart'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { AdminDashboardData } from '@/server/queries/dashboard-queries'

type Props = { data: AdminDashboardData }

export function AdminDashboard({ data }: Props) {
  const { global, clinicsRanking, revenueByMonth, revenueShare, insightsCritical } = data

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total de leads" value={global.totalLeads.toLocaleString('pt-BR')} />
        <KpiCard
          label="Faturamento"
          value={formatCurrency(global.totalRevenue)}
          delta={global.revenueGrowthMoM}
          hint={
            global.previousRevenue > 0
              ? `vs ${formatCurrency(global.previousRevenue)} no período anterior`
              : undefined
          }
        />
        <KpiCard label="Conversão média" value={formatPercent(global.conversionRate)} />
        <KpiCard
          label="No-show médio"
          value={formatPercent(global.noShowRate)}
          invertDelta
          tone={(global.noShowRate ?? 0) > 0.25 ? 'critical' : 'default'}
        />
        <KpiCard
          label="Receita perdida (no-show)"
          value={formatCurrency(global.estimatedLostRevenue)}
          hint="Σ no-show × ticket médio"
        />
        <KpiCard label="Clínicas ativas" value={String(global.totalClinics)} />
        <KpiCard
          label="Health Score médio"
          value={global.averageHealthScore != null ? String(global.averageHealthScore) : '—'}
          tone={
            global.averageHealthScore == null
              ? 'default'
              : global.averageHealthScore <= 40
                ? 'critical'
                : global.averageHealthScore <= 60
                  ? 'warning'
                  : 'good'
          }
        />
        <KpiCard label="Crescimento MoM" value={formatPercent(global.revenueGrowthMoM)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Faturamento — últimos 12 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueLineChart data={revenueByMonth} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receita por clínica</CardTitle>
          </CardHeader>
          <CardContent>
            <SharePieChart data={revenueShare.map((r) => ({ name: r.name, value: r.revenue }))} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ranking de clínicas por faturamento</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={clinicsRanking
                .filter((r) => r.revenue > 0)
                .slice(0, 10)
                .map((r) => ({ label: r.name, value: r.revenue }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Insights críticos abertos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insightsCritical.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum insight crítico aberto.</p>
            ) : (
              insightsCritical.map((i) => (
                <div key={i.id} className="rounded-md border bg-rose-50/50 p-3 text-sm">
                  <p className="font-medium leading-tight">{i.title}</p>
                  <p className="text-xs text-muted-foreground">{i.clientName}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparativo de clínicas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Clínica</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Leads</th>
                  <th className="py-2 text-right font-medium">Conversão</th>
                  <th className="py-2 text-right font-medium">No-show</th>
                  <th className="py-2 text-right font-medium">Receita</th>
                  <th className="py-2 text-right font-medium">Margem</th>
                  <th className="py-2 text-right font-medium">Health</th>
                </tr>
              </thead>
              <tbody>
                {clinicsRanking.map((r) => (
                  <tr key={r.clientId} className="border-b last:border-0">
                    <td className="py-2">
                      <Link
                        href={`/clients/${r.clientId}/overview`}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="py-2">
                      <Badge
                        variant={
                          r.status === 'ACTIVE'
                            ? 'success'
                            : r.status === 'ONBOARDING'
                              ? 'info'
                              : r.status === 'CHURNED'
                                ? 'critical'
                                : 'secondary'
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-2 text-right">{r.leads}</td>
                    <td className="py-2 text-right">{formatPercent(r.conversionRate)}</td>
                    <td className="py-2 text-right">{formatPercent(r.noShowRate)}</td>
                    <td className="py-2 text-right">{formatCurrency(r.revenue)}</td>
                    <td className="py-2 text-right">{formatPercent(r.netMargin)}</td>
                    <td className="py-2 text-right">{r.healthScore ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
