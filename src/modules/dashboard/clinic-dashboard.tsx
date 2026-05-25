import { FunnelBars } from '@/components/charts/funnel-bars'
import { HorizontalBarChart } from '@/components/charts/horizontal-bar-chart'
import { RevenueCostBars } from '@/components/charts/revenue-cost-bars'
import { SharePieChart } from '@/components/charts/share-pie-chart'
import { InfoHint } from '@/components/dashboard/info-hint'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { ClinicDashboardData } from '@/server/queries/dashboard-queries'

import type { DashboardVisibility } from '@/server/auth/dashboard-visibility'

import { ReceivedRevenueChart } from './received-revenue-chart'

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

type Props = {
  data: ClinicDashboardData
  // Visibilidade por cargo (Etapa 3 / lacuna 2). Ausente ⇒ tudo visível
  // (retrocompat: chamadas que não passam o mapa não escondem nada).
  visibility?: DashboardVisibility
}

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

  // vis(section) = seção visível? vis(section, item) = item visível?
  // Sem mapa de visibilidade, tudo aparece.
  const vis = (section: string, item?: string): boolean => {
    if (!visibility) return true
    const s = visibility[section]
    if (!s || !s.section) return false
    if (!item) return true
    return s.items[item] !== false
  }

  const showCommercial = vis('commercialKpis')
  const showFinancial = vis('financialKpis')
  const showKpiGrid = showCommercial || showFinancial

  // Bloco de gráficos: coluna esquerda (2/3) = gráficos de receita empilhados;
  // coluna direita (1/3) = Funil + Origem dos leads empilhados (a Origem
  // preenche o vão abaixo do funil). Como a contagem visível varia por cargo,
  // só usamos o layout 2-colunas quando há conteúdo dos DOIS lados; senão o
  // que sobra estica para a largura toda (sem vão lateral).
  const showRevGenerated = vis('revenueCharts', 'revenueGenerated')
  const showRevReceived = vis('revenueCharts', 'revenueReceived')
  const showFunnel = vis('revenueCharts', 'funnel')
  const showLeadsSource = vis('distributions', 'leadsBySource')
  const showRevByProcedure = vis('distributions', 'revenueByProcedure')

  const hasRevenueCol = showRevGenerated || showRevReceived // coluna esquerda
  const hasSideCol = showFunnel || showLeadsSource // coluna direita
  const chartsTwoCol = hasRevenueCol && hasSideCol
  const showChartsBlock = hasRevenueCol || hasSideCol

  // Faixa "Receita por procedimento (2/3) + Insights (1/3)". Cada lado depende
  // do cargo, então só vira 2 colunas quando ambos aparecem; senão o presente
  // estica. Progresso de metas fica numa faixa própria abaixo.
  const showInsights = vis('tracking', 'insights')
  const showGoals = vis('tracking', 'goals')
  const procInsightsTwoCol = showRevByProcedure && showInsights
  const showProcInsightsBlock = showRevByProcedure || showInsights

  return (
    <div className="space-y-6">
      {showKpiGrid && (
        // 4 KPIs por linha no desktop (xl), degradando para 3/2/1 em telas
        // menores. Cards maiores e legíveis; vãos só no fim da última linha
        // quando o cargo mostra menos itens (sem card órfão no meio).
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {vis('commercialKpis', 'leads') && (
            <KpiCard label="Leads totais" value={String(kpis.commercial.leadsCount)} />
          )}
          {vis('commercialKpis', 'appointments') && (
            <KpiCard label="Agendamentos" value={String(kpis.commercial.appointmentsCount)} />
          )}
          {vis('commercialKpis', 'attendance') && (
            <KpiCard label="Comparecimento" value={formatPercent(kpis.commercial.attendanceRate)} />
          )}
          {vis('commercialKpis', 'noShow') && (
            <KpiCard
              label="No-show"
              value={formatPercent(kpis.commercial.noShowRate)}
              invertDelta
              tone={(kpis.commercial.noShowRate ?? 0) > 0.25 ? 'critical' : 'default'}
              info={
                <>
                  <p className="font-medium text-foreground">Taxa de no-show</p>
                  <p className="mt-1">
                    Percentual de agendamentos em que o paciente não compareceu sem avisar.
                    Calculado como{' '}
                    <span className="font-medium">no-shows ÷ (atendidos + no-shows)</span>.
                  </p>
                  <p className="mt-1">
                    Apenas desfechos conhecidos entram no cálculo — agendamentos futuros,
                    cancelamentos comunicados e remarcações não diluem a taxa. Acima de 25% a
                    clínica deve agir (lembrete por WhatsApp, exigir sinal etc.).
                  </p>
                </>
              }
            />
          )}
          {vis('commercialKpis', 'conversion') && (
            <KpiCard
              label="Conversão"
              value={formatPercent(kpis.commercial.conversionRate)}
              tone={(kpis.commercial.conversionRate ?? 1) < 0.1 ? 'warning' : 'default'}
            />
          )}
          {vis('financialKpis', 'revenue') && (
            <KpiCard
              label="Faturamento"
              value={formatCurrency(kpis.financial.totalRevenue)}
              delta={data.kpis.revenueGrowthMoM}
            />
          )}
          {vis('financialKpis', 'costs') && (
            <KpiCard label="Custos" value={formatCurrency(kpis.financial.totalCosts)} />
          )}
          {vis('financialKpis', 'netProfit') && (
            <KpiCard
              label="Lucro líquido"
              value={formatCurrency(kpis.financial.netProfit)}
              tone={kpis.financial.netProfit < 0 ? 'critical' : 'default'}
            />
          )}
          {vis('financialKpis', 'averageTicket') && (
            <KpiCard
              label="Ticket médio"
              value={formatCurrency(kpis.financial.averageTicket)}
              info={
                <>
                  <p className="font-medium text-foreground">Ticket médio</p>
                  <p className="mt-1">
                    Valor médio por receita lançada no período. Calculado como{' '}
                    <span className="font-medium">receita total ÷ número de receitas</span>. Quanto
                    mais alto, mais a clínica fatura por atendimento.
                  </p>
                </>
              }
            />
          )}
          {vis('financialKpis', 'grossMargin') && (
            <KpiCard label="Margem bruta" value={formatPercent(kpis.financial.grossMargin)} />
          )}
          {vis('financialKpis', 'netMargin') && (
            <KpiCard
              label="Margem líquida"
              value={formatPercent(kpis.financial.netMargin)}
              tone={(kpis.financial.netMargin ?? 1) < 0.2 ? 'warning' : 'default'}
            />
          )}
          {vis('financialKpis', 'roi') && (
            <KpiCard
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
                    100% significa que cada R$ 1 investido trouxe R$ 1 de lucro além do
                    investimento. Valores negativos indicam que o marketing custou mais do que
                    gerou.
                  </p>
                </>
              }
            />
          )}
          {vis('financialKpis', 'cac') && (
            <KpiCard
              label="CAC"
              value={formatCurrency(kpis.financial.cac)}
              info={
                <>
                  <p className="font-medium text-foreground">CAC — Custo de Aquisição de Cliente</p>
                  <p className="mt-1">
                    Quanto custou, em média, conquistar cada novo paciente no período. Calculado
                    como{' '}
                    <span className="font-medium">
                      custo total de marketing ÷ novos pacientes cadastrados
                    </span>
                    .
                  </p>
                  <p className="mt-1">
                    Compare com o ticket médio: se o CAC for maior que o ticket, a clínica está
                    gastando mais para atrair do que recebe por atendimento.
                  </p>
                </>
              }
            />
          )}
          {vis('commercialKpis', 'timeToFirstContact') && (
            <KpiCard
              label="Tempo até 1º contato"
              value={
                kpis.commercial.avgTimeToFirstContactMin != null
                  ? `${kpis.commercial.avgTimeToFirstContactMin} min`
                  : '—'
              }
              invertDelta
            />
          )}
          {vis('financialKpis', 'lostRevenue') && (
            <KpiCard
              label="Receita perdida"
              value={formatCurrency(kpis.financial.estimatedLostRevenue)}
              info={<p>Soma do preço dos procedimentos em no-show.</p>}
            />
          )}
          {vis('financialKpis', 'healthScore') && (
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
              info={
                <>
                  <p className="font-medium text-foreground">Health Score (0–100)</p>
                  <p className="mt-1">
                    Nota composta da saúde da clínica. Soma ponderada de até 6 dimensões; dimensões
                    sem dado são ignoradas e o peso é redistribuído.
                  </p>
                  <ul className="mt-2 space-y-1">
                    <li>
                      <span className="font-medium">Conversão</span> (peso 25%): pontua 100 a cada
                      20% de conversão lead → venda.
                    </li>
                    <li>
                      <span className="font-medium">No-show invertido</span> (peso 20%): 100 com 0%
                      de faltas; cai a 0 com 25%.
                    </li>
                    <li>
                      <span className="font-medium">Margem líquida</span> (peso 20%): 100 a partir
                      de 40% de margem.
                    </li>
                    <li>
                      <span className="font-medium">Crescimento MoM</span> (peso 15%): 100 com +20%
                      mês a mês; 0 com −20%.
                    </li>
                    <li>
                      <span className="font-medium">Leads vs meta</span> (peso 10%): % de
                      atingimento da meta de leads, limitado a 100.
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
          )}
        </div>
      )}

      {showChartsBlock && (
        // 2/3 + 1/3 só quando há conteúdo dos dois lados; senão a coluna presente
        // estica para a largura toda (sem vão lateral feio quando o cargo esconde).
        <div
          className={
            chartsTwoCol ? 'grid items-start gap-4 lg:grid-cols-3' : 'grid items-start gap-4'
          }
        >
          {hasRevenueCol && (
            <div className={chartsTwoCol ? 'grid gap-4 lg:col-span-2' : 'grid gap-4'}>
              {showRevGenerated && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-1.5 text-base">
                      <span>Receita gerada x Custos — últimos 12 meses</span>
                      <InfoHint label="Receita gerada x Custos">
                        <p className="font-medium text-foreground">Receita gerada</p>
                        <p className="mt-1">
                          Soma do valor cheio das vendas no mês em que foram lançadas, independente
                          do parcelamento. É a referência contábil de quanto foi faturado.
                        </p>
                        <p className="mt-2">
                          <span className="font-medium">Exemplo:</span> um procedimento de R$ 5.000
                          parcelado em 12x e vendido em maio aparece como{' '}
                          <span className="font-medium">R$ 5.000 em maio</span> aqui.
                        </p>
                      </InfoHint>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RevenueCostBars data={revenueByMonth} revenueName="Receita gerada" />
                  </CardContent>
                </Card>
              )}
              {showRevReceived && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-1.5 text-base">
                      <span>Receita recebida x Custos</span>
                      <InfoHint label="Receita recebida x Custos">
                        <p className="font-medium text-foreground">Receita recebida</p>
                        <p className="mt-1">
                          Simulação do fluxo de caixa: o valor da venda é distribuído pelos meses
                          conforme o número de parcelas. Cada mês mostra o que efetivamente entra no
                          caixa.
                        </p>
                        <p className="mt-2">
                          <span className="font-medium">Exemplo:</span> um procedimento de R$ 5.000
                          parcelado em 12x vendido em maio aparece como{' '}
                          <span className="font-medium">R$ 416,67 em maio</span> e o mesmo valor em
                          cada um dos 11 meses seguintes (até abril do ano seguinte).
                        </p>
                        <p className="mt-2">
                          <span className="font-medium">Custos futuros:</span> incluem a projeção
                          dos custos fixos cadastrados (custos recorrentes ainda não lançados).
                          Mudanças nesses custos refletem aqui automaticamente.
                        </p>
                        <p className="mt-2 text-muted-foreground">
                          Use as setas para navegar pelos meses anteriores e posteriores. O mês
                          central fica sempre destacado no rodapé do gráfico.
                        </p>
                      </InfoHint>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ReceivedRevenueChart
                      data={receivedByMonth}
                      centerIndex={receivedCenterIndex}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {hasSideCol && (
            // Coluna direita: Funil + Origem dos leads empilhados. A Origem
            // encaixa no espaço que sobra ao lado dos gráficos de receita.
            <div className="grid gap-4">
              {showFunnel && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Funil de conversão</CardTitle>
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
        // Receita por procedimento (2/3) + Insights ativos (1/3). Vira 2 colunas
        // só quando os dois aparecem; senão o presente ocupa a largura toda.
        <div className={procInsightsTwoCol ? 'grid gap-4 lg:grid-cols-3' : 'grid gap-4'}>
          {showRevByProcedure && (
            <Card className={procInsightsTwoCol ? 'lg:col-span-2' : undefined}>
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
          )}
        </div>
      )}

      {showGoals && (
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
      )}
    </div>
  )
}
