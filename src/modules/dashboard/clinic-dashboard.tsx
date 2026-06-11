import { FunnelBars } from '@/components/charts/funnel-bars'
import { HorizontalBarChart } from '@/components/charts/horizontal-bar-chart'
import { SharePieChart } from '@/components/charts/share-pie-chart'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { metricLabel } from '@/shared/goal-labels'
import type { ClinicDashboardData } from '@/server/queries/dashboard-queries'

import type { DashboardVisibility } from '@/server/auth/dashboard-visibility'

import { RevenueChartsCard } from './revenue-charts-card'

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
  CRITICAL: 'border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/40',
  WARNING: 'border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40',
  INFO: 'border-sky-300 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/40',
}

/**
 * Delta relativo vs período anterior comparável. `null` (sem seta) quando não
 * dá para comparar com honestidade: valor ausente ou base anterior ≤ 0 (inclui
 * lucro anterior negativo — variação % sobre base negativa é enganosa).
 */
function rel(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev <= 0) return null
  return (curr - prev) / prev
}

type Props = {
  data: ClinicDashboardData
  // Visibilidade por cargo (Etapa 3 / lacuna 2). Ausente ⇒ tudo visível
  // (retrocompat: chamadas que não passam o mapa não escondem nada).
  visibility?: DashboardVisibility
}

/**
 * LAYOUT EM UNIDADES (decisão estética 2026-06-11): a página tem 4 "espaços"
 * por linha; cada widget vale um nº de unidades — KPI = 1, funil = 1,5,
 * gráficos de receita = 2,5. Como há meios-valores, o grid real é de 8 colunas
 * (1 unidade = 2 colunas): KPI `col-span-2`, funil `col-span-3`, gráficos
 * `col-span-5`. Buracos verticais são tapados POSICIONANDO o próximo widget na
 * mesma coluna (ex.: Metas sob o gráfico de receita) — encaixe determinístico,
 * sem JS de medição.
 */
export function ClinicDashboard({ data, visibility }: Props) {
  const {
    kpis,
    revenueByMonth,
    receivedByMonth,
    receivedCenterIndex,
    funnel,
    revenueByProcedure,
    leadsBySource,
    insightsOpen,
    goalsProgress,
  } = data

  const prev = kpis.previous

  // vis(section) = seção visível? vis(section, item) = item visível?
  // Sem mapa de visibilidade, tudo aparece.
  const vis = (section: string, item?: string): boolean => {
    if (!visibility) return true
    const s = visibility[section]
    if (!s || !s.section) return false
    if (!item) return true
    return s.items[item] !== false
  }

  // Card de No-show absorve Comparecimento e Receita perdida como linhas
  // secundárias (são o mesmo assunto: desfecho dos agendamentos). Se o cargo
  // esconder o No-show mas mostrar um dos dois, eles voltam como card próprio.
  const showNoShow = vis('commercialKpis', 'noShow')
  const showAttendance = vis('commercialKpis', 'attendance')
  const showLostRevenue = vis('financialKpis', 'lostRevenue')

  // "Tempo até 1º contato" só aparece com dado real: hoje nada escreve
  // `firstContactAt` (o write falso do webhook foi removido); o card volta
  // sozinho quando a integração WhatsApp instrumentar o campo (spec no ledger
  // retencao-reforma-progresso.md).
  const showTimeToFirstContact =
    vis('commercialKpis', 'timeToFirstContact') && kpis.commercial.avgTimeToFirstContactMin != null

  // Todos os cards no MESMO tamanho (1 unidade cada); a hierarquia vem da
  // ORDEM — os 4 números-resumo (faturamento, lucro, conversão, health)
  // abrem a grade.
  const kpiCards: React.ReactNode[] = []
  if (vis('financialKpis', 'revenue')) {
    kpiCards.push(
      <KpiCard
        key="revenue"
        label="Faturamento"
        value={formatCurrency(kpis.financial.totalRevenue)}
        delta={data.kpis.revenueGrowthMoM}
      />
    )
  }
  if (vis('financialKpis', 'netProfit')) {
    kpiCards.push(
      <KpiCard
        key="netProfit"
        label="Lucro líquido"
        value={formatCurrency(kpis.financial.netProfit)}
        delta={rel(kpis.financial.netProfit, prev.financial.netProfit)}
        tone={kpis.financial.netProfit < 0 ? 'critical' : 'default'}
      />
    )
  }
  if (vis('commercialKpis', 'conversion')) {
    kpiCards.push(
      <KpiCard
        key="conversion"
        label="Conversão"
        value={formatPercent(kpis.commercial.conversionRate)}
        delta={rel(kpis.commercial.conversionRate, prev.commercial.conversionRate)}
        tone={(kpis.commercial.conversionRate ?? 1) < 0.1 ? 'warning' : 'default'}
      />
    )
  }
  if (vis('financialKpis', 'healthScore')) {
    kpiCards.push(
      <KpiCard
        key="healthScore"
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
        info={
          <>
            <p className="font-medium text-foreground">Health Score (0–100)</p>
            <p className="mt-1">
              Nota composta da saúde da clínica. Soma ponderada de até 6 dimensões; dimensões sem
              dado são ignoradas e o peso é redistribuído.
            </p>
            <ul className="mt-2 space-y-1">
              <li>
                <span className="font-medium">Conversão</span> (peso 25%): pontua 100 a cada 20% de
                conversão lead → venda.
              </li>
              <li>
                <span className="font-medium">No-show invertido</span> (peso 20%): 100 com 0% de
                faltas; cai a 0 com 25%.
              </li>
              <li>
                <span className="font-medium">Margem líquida</span> (peso 20%): 100 a partir de 40%
                de margem.
              </li>
              <li>
                <span className="font-medium">Crescimento MoM</span> (peso 15%): 100 com +20% mês a
                mês; 0 com −20%.
              </li>
              <li>
                <span className="font-medium">Leads vs meta</span> (peso 10%): % de atingimento da
                meta de leads ativa (prorateada ao período).
              </li>
              <li>
                <span className="font-medium">Tempo até 1º contato</span> (peso 10%): 100
                instantâneo; 0 a partir de 120 min.
              </li>
            </ul>
            <p className="mt-2">
              Faixas: <span className="font-medium text-rose-600">0–40 crítico</span>
              {' · '}
              <span className="font-medium text-amber-600">41–60 atenção</span>
              {' · '}
              <span className="font-medium">61–80 bom</span>
              {' · '}
              <span className="font-medium text-emerald-600">81–100 excelente</span>.
            </p>
          </>
        }
      />
    )
  }
  if (vis('commercialKpis', 'leads')) {
    kpiCards.push(
      <KpiCard
        key="leads"
        label="Leads totais"
        value={String(kpis.commercial.leadsCount)}
        delta={rel(kpis.commercial.leadsCount, prev.commercial.leadsCount)}
      />
    )
  }
  if (vis('commercialKpis', 'appointments')) {
    kpiCards.push(
      <KpiCard
        key="appointments"
        label="Agendamentos"
        value={String(kpis.commercial.appointmentsCount)}
        delta={rel(kpis.commercial.appointmentsCount, prev.commercial.appointmentsCount)}
      />
    )
  }
  if (showNoShow) {
    kpiCards.push(
      <KpiCard
        key="noShow"
        label="No-show"
        value={formatPercent(kpis.commercial.noShowRate)}
        delta={rel(kpis.commercial.noShowRate, prev.commercial.noShowRate)}
        invertDelta
        tone={(kpis.commercial.noShowRate ?? 0) > 0.25 ? 'critical' : 'default'}
        info={
          <>
            <p className="font-medium text-foreground">Taxa de no-show</p>
            <p className="mt-1">
              Percentual de agendamentos em que o paciente não compareceu sem avisar. Calculado como{' '}
              <span className="font-medium">no-shows ÷ (atendidos + no-shows)</span>.
            </p>
            <p className="mt-1">
              Apenas desfechos conhecidos entram no cálculo — agendamentos futuros, cancelamentos
              comunicados e remarcações não diluem a taxa. Acima de 25% a clínica deve agir
              (lembrete por WhatsApp, exigir sinal etc.).
            </p>
            <p className="mt-1">
              <span className="font-medium">Receita perdida</span> = soma do preço dos procedimentos
              agendados nos no-shows do período.
            </p>
          </>
        }
      >
        {(showAttendance || showLostRevenue) && (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {showAttendance && (
              <p>Comparecimento: {formatPercent(kpis.commercial.attendanceRate)}</p>
            )}
            {showLostRevenue && (
              <p>Receita perdida: {formatCurrency(kpis.financial.estimatedLostRevenue)}</p>
            )}
          </div>
        )}
      </KpiCard>
    )
  } else {
    if (showAttendance) {
      kpiCards.push(
        <KpiCard
          key="attendance"
          label="Comparecimento"
          value={formatPercent(kpis.commercial.attendanceRate)}
          delta={rel(kpis.commercial.attendanceRate, prev.commercial.attendanceRate)}
        />
      )
    }
    if (showLostRevenue) {
      kpiCards.push(
        <KpiCard
          key="lostRevenue"
          label="Receita perdida"
          value={formatCurrency(kpis.financial.estimatedLostRevenue)}
          info={<p>Soma do preço dos procedimentos em no-show.</p>}
        />
      )
    }
  }
  if (vis('financialKpis', 'averageTicket')) {
    kpiCards.push(
      <KpiCard
        key="averageTicket"
        label="Ticket médio"
        value={formatCurrency(kpis.financial.averageTicket)}
        delta={rel(kpis.financial.averageTicket, prev.financial.averageTicket)}
        info={
          <>
            <p className="font-medium text-foreground">Ticket médio</p>
            <p className="mt-1">
              Valor médio por receita lançada no período. Calculado como{' '}
              <span className="font-medium">receita total ÷ número de receitas</span>. Quanto mais
              alto, mais a clínica fatura por atendimento.
            </p>
          </>
        }
      />
    )
  }
  if (vis('financialKpis', 'costs')) {
    kpiCards.push(
      <KpiCard
        key="costs"
        label="Custos"
        value={formatCurrency(kpis.financial.totalCosts)}
        delta={rel(kpis.financial.totalCosts, prev.financial.totalCosts)}
        invertDelta
      />
    )
  }
  if (vis('financialKpis', 'netMargin')) {
    kpiCards.push(
      <KpiCard
        key="netMargin"
        label="Margem líquida"
        value={formatPercent(kpis.financial.netMargin)}
        delta={rel(kpis.financial.netMargin, prev.financial.netMargin)}
        tone={(kpis.financial.netMargin ?? 1) < 0.2 ? 'warning' : 'default'}
      />
    )
  }
  if (vis('financialKpis', 'roi')) {
    kpiCards.push(
      <KpiCard
        key="roi"
        label="ROI marketing"
        value={kpis.financial.roi != null ? `${(kpis.financial.roi * 100).toFixed(0)}%` : '—'}
        info={
          <>
            <p className="font-medium text-foreground">ROI de marketing</p>
            <p className="mt-1">
              Retorno sobre o investimento em marketing. Calculado como{' '}
              <span className="font-medium">
                (receita atribuída a marketing − custo de marketing) ÷ custo de marketing
              </span>
              .
            </p>
            <p className="mt-1">
              100% significa que cada R$ 1 investido trouxe R$ 1 de lucro além do investimento.
              Valores negativos indicam que o marketing custou mais do que gerou.
            </p>
          </>
        }
      />
    )
  }
  if (vis('financialKpis', 'cac')) {
    kpiCards.push(
      <KpiCard
        key="cac"
        label="CAC"
        value={formatCurrency(kpis.financial.cac)}
        delta={rel(kpis.financial.cac, prev.financial.cac)}
        invertDelta
        info={
          <>
            <p className="font-medium text-foreground">CAC — Custo de Aquisição de Cliente</p>
            <p className="mt-1">
              Quanto custou, em média, conquistar cada novo paciente no período. Calculado como{' '}
              <span className="font-medium">
                custo total de marketing ÷ novos pacientes cadastrados
              </span>
              . Pacientes provisórios de agendamento (que nunca compareceram) não contam.
            </p>
            <p className="mt-1">
              Compare com o ticket médio: se o CAC for maior que o ticket, a clínica está gastando
              mais para atrair do que recebe por atendimento.
            </p>
          </>
        }
      />
    )
  }
  if (showTimeToFirstContact) {
    kpiCards.push(
      <KpiCard
        key="timeToFirstContact"
        label="Tempo até 1º contato"
        value={`${kpis.commercial.avgTimeToFirstContactMin} min`}
        delta={rel(
          kpis.commercial.avgTimeToFirstContactMin,
          prev.commercial.avgTimeToFirstContactMin
        )}
        invertDelta
      />
    )
  }

  const showRevGenerated = vis('revenueCharts', 'revenueGenerated')
  const showRevReceived = vis('revenueCharts', 'revenueReceived')
  const showFunnel = vis('revenueCharts', 'funnel')
  const showLeadsSource = vis('distributions', 'leadsBySource')
  const showRevByProcedure = vis('distributions', 'revenueByProcedure')
  const showInsights = vis('tracking', 'insights')
  const showGoals = vis('tracking', 'goals')

  const hasRevenueCol = showRevGenerated || showRevReceived // coluna 2,5 un.
  const hasSideCol = showFunnel || showLeadsSource // coluna 1,5 un.
  const chartsTwoCol = hasRevenueCol && hasSideCol
  const showChartsBlock = hasRevenueCol || hasSideCol

  // Metas sobe para a coluna do gráfico de receita (tapa o vão vertical que a
  // unificação dos dois gráficos deixou). Sem a coluna de receita, vira faixa
  // própria no fim, como antes.
  const goalsInRevenueCol = showGoals && hasRevenueCol

  const goalsCard = showGoals ? (
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
                <span className="font-medium">{metricLabel(g.metric)}</span>
                <span className="text-muted-foreground">{g.progressPct.toFixed(0)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, g.progressPct)}%` }}
                />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {g.currentValue.toLocaleString('pt-BR')} de {g.targetValue.toLocaleString('pt-BR')}{' '}
                · termina {new Intl.DateTimeFormat('pt-BR').format(g.endDate)}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  ) : null

  const procInsightsTwoCol = showRevByProcedure && showInsights
  const showProcInsightsBlock = showRevByProcedure || showInsights

  return (
    <div className="space-y-4">
      {kpiCards.length > 0 && (
        // KPIs: 1 unidade cada, mesmo tamanho — 4 por linha no desktop,
        // degradando para 3/2/1 em telas menores.
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{kpiCards}</div>
      )}

      {showChartsBlock && (
        // Linha de unidades 2,5 + 1,5 → grid de 8 colunas (5 + 3). Quando só
        // um lado existe (cargo escondeu o outro), o presente estica.
        <div
          className={
            chartsTwoCol ? 'grid items-start gap-3 lg:grid-cols-8' : 'grid items-start gap-3'
          }
        >
          {hasRevenueCol && (
            <div className={chartsTwoCol ? 'grid gap-3 lg:col-span-5' : 'grid gap-3'}>
              <RevenueChartsCard
                generated={revenueByMonth}
                received={receivedByMonth}
                receivedCenterIndex={receivedCenterIndex}
                showGenerated={showRevGenerated}
                showReceived={showRevReceived}
              />
              {goalsInRevenueCol && goalsCard}
            </div>
          )}

          {hasSideCol && (
            // Coluna 1,5 un.: Funil + Origem dos leads empilhados.
            <div className={chartsTwoCol ? 'grid gap-3 lg:col-span-3' : 'grid gap-3'}>
              {showFunnel && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Funil de conversão</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Leads criados no período, por etapa atual. Fechado conta pela data de
                      fechamento.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <FunnelBars data={funnel} />
                  </CardContent>
                </Card>
              )}
              {showLeadsSource && (
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
              )}
            </div>
          )}
        </div>
      )}

      {showProcInsightsBlock && (
        // Mesma régua de unidades (5 + 3): Receita por procedimento + Insights.
        <div className={procInsightsTwoCol ? 'grid gap-3 lg:grid-cols-8' : 'grid gap-3'}>
          {showRevByProcedure && (
            <Card className={procInsightsTwoCol ? 'lg:col-span-5' : undefined}>
              <CardHeader>
                <CardTitle className="text-base">Receita por procedimento</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart
                  data={revenueByProcedure.map((p) => ({ label: p.name, value: p.total }))}
                />
              </CardContent>
            </Card>
          )}
          {showInsights && (
            <Card className={procInsightsTwoCol ? 'lg:col-span-3' : undefined}>
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
          )}
        </div>
      )}

      {showGoals && !goalsInRevenueCol && goalsCard}
    </div>
  )
}
