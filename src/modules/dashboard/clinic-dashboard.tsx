import { FunnelBars } from '@/components/charts/funnel-bars'
import { HorizontalBarChart } from '@/components/charts/horizontal-bar-chart'
import { RevenueCostBars } from '@/components/charts/revenue-cost-bars'
import { SharePieChart } from '@/components/charts/share-pie-chart'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { ClinicDashboardData } from '@/server/queries/dashboard-queries'

const LEAD_SOURCE_LABEL: Record<string, string> = {
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google Ads',
  ORGANIC: 'Orgânico',
  REFERRAL: 'Indicação',
  WHATSAPP: 'WhatsApp',
  WALK_IN: 'Walk-in',
  OTHER: 'Outros',
}

const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: 'border-rose-300 bg-rose-50/60',
  WARNING: 'border-amber-300 bg-amber-50/60',
  INFO: 'border-sky-300 bg-sky-50/60',
}

type Props = { data: ClinicDashboardData }

export function ClinicDashboard({ data }: Props) {
  const {
    kpis,
    revenueByMonth,
    funnel,
    revenueByProcedure,
    leadsBySource,
    insightsOpen,
    goalsProgress,
  } = data

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Leads totais" value={String(kpis.commercial.leadsCount)} />
        <KpiCard label="Agendamentos" value={String(kpis.commercial.appointmentsCount)} />
        <KpiCard label="Comparecimento" value={formatPercent(kpis.commercial.attendanceRate)} />
        <KpiCard
          label="No-show"
          value={formatPercent(kpis.commercial.noShowRate)}
          invertDelta
          tone={(kpis.commercial.noShowRate ?? 0) > 0.25 ? 'critical' : 'default'}
        />
        <KpiCard
          label="Conversão"
          value={formatPercent(kpis.commercial.conversionRate)}
          tone={(kpis.commercial.conversionRate ?? 1) < 0.1 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Faturamento"
          value={formatCurrency(kpis.financial.totalRevenue)}
          delta={data.kpis.revenueGrowthMoM}
        />
        <KpiCard label="Custos" value={formatCurrency(kpis.financial.totalCosts)} />
        <KpiCard
          label="Lucro líquido"
          value={formatCurrency(kpis.financial.netProfit)}
          tone={kpis.financial.netProfit < 0 ? 'critical' : 'default'}
        />
        <KpiCard label="Ticket médio" value={formatCurrency(kpis.financial.averageTicket)} />
        <KpiCard label="Margem bruta" value={formatPercent(kpis.financial.grossMargin)} />
        <KpiCard
          label="Margem líquida"
          value={formatPercent(kpis.financial.netMargin)}
          tone={(kpis.financial.netMargin ?? 1) < 0.2 ? 'warning' : 'default'}
        />
        <KpiCard
          label="ROI marketing"
          value={kpis.financial.roi != null ? `${(kpis.financial.roi * 100).toFixed(0)}%` : '—'}
        />
        <KpiCard label="CAC" value={formatCurrency(kpis.financial.cac)} />
        <KpiCard
          label="Tempo até 1º contato"
          value={
            kpis.commercial.avgTimeToFirstContactMin != null
              ? `${kpis.commercial.avgTimeToFirstContactMin} min`
              : '—'
          }
          invertDelta
        />
        <KpiCard
          label="Receita perdida"
          value={formatCurrency(kpis.financial.estimatedLostRevenue)}
          hint="Soma do preço dos procedimentos em no-show"
        />
        <KpiCard
          label="Health Score"
          value={kpis.healthScore != null ? String(kpis.healthScore) : '—'}
          tone={
            kpis.healthScore == null
              ? 'default'
              : kpis.healthScore <= 40
                ? 'critical'
                : kpis.healthScore <= 60
                  ? 'warning'
                  : 'good'
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Receita vs Custos — últimos 12 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueCostBars data={revenueByMonth} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funil de conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelBars data={funnel} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receita por procedimento</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={revenueByProcedure.map((p) => ({ label: p.name, value: p.total }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Origem dos leads</CardTitle>
          </CardHeader>
          <CardContent>
            <SharePieChart
              data={leadsBySource.map((s) => ({
                name: LEAD_SOURCE_LABEL[s.source] ?? s.source,
                value: s.count,
              }))}
              valueFormat="count"
              unitLabel="leads"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Insights ativos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insightsOpen.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum insight aberto.</p>
            ) : (
              insightsOpen.map((i) => (
                <div
                  key={i.id}
                  className={`rounded-md border p-3 text-sm ${SEVERITY_TONE[i.severity] ?? ''}`}
                >
                  <p className="font-medium leading-tight">{i.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{i.diagnosis}</p>
                  <p className="mt-1 text-xs">
                    <span className="font-medium">Sugestão:</span> {i.suggestion}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progresso de metas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {goalsProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma meta ativa.</p>
            ) : (
              goalsProgress.map((g) => (
                <div key={g.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{g.metric}</span>
                    <span className="text-muted-foreground">{g.progressPct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, g.progressPct)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.currentValue.toLocaleString('pt-BR')} de{' '}
                    {g.targetValue.toLocaleString('pt-BR')} · termina{' '}
                    {new Intl.DateTimeFormat('pt-BR').format(g.endDate)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
