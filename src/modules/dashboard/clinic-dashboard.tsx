import {
  Banknote,
  BarChart3,
  Calendar,
  Clock,
  Filter,
  Heart,
  Receipt,
  Tag,
  Target,
  TrendingUp,
  UserCheck,
  UserX,
  Wallet,
  Zap,
} from 'lucide-react'

import { ConversionFunnelCard } from '@/components/clinic/dashboard/conversion-funnel-card'
import { formatBRL0 } from '@/components/clinic/dashboard/format'
import { GoalsCard } from '@/components/clinic/dashboard/goals-card'
import { InsightsCard } from '@/components/clinic/dashboard/insights-card'
import { LeadSourcesDonut } from '@/components/clinic/dashboard/lead-sources-donut'
import { ProceduresBarsCard } from '@/components/clinic/dashboard/procedures-bars-card'
import { RevenueCostChart } from '@/components/clinic/dashboard/revenue-cost-chart'
import { SennoKpiCard } from '@/components/clinic/dashboard/senno-kpi-card'
import { UpcomingAppointmentsCard } from '@/components/clinic/dashboard/upcoming-appointments-card'
import { formatPercent } from '@/lib/utils'
import type { DashboardVisibility } from '@/server/auth/dashboard-visibility'
import type { ClinicDashboardData } from '@/server/queries/dashboard-queries'

const LEAD_SOURCE_LABEL: Record<string, string> = {
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google Ads',
  ORGANIC: 'Orgânico',
  REFERRAL: 'Indicação',
  WHATSAPP: 'WhatsApp',
  WALK_IN: 'Presencial',
  OTHER: 'Outros',
}

/**
 * Delta relativo vs período anterior comparável. `null` (sem pill) quando não
 * dá para comparar com honestidade: valor ausente ou base anterior ≤ 0 (inclui
 * lucro anterior negativo — variação % sobre base negativa é enganosa).
 */
function rel(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev <= 0) return null
  return (curr - prev) / prev
}

function healthLabel(score: number): string {
  if (score <= 40) return 'crítico'
  if (score <= 60) return 'atenção'
  if (score <= 80) return 'bom'
  return 'excelente'
}

type Props = {
  data: ClinicDashboardData
  // Visibilidade por cargo (Etapa 3 / lacuna 2). Ausente ⇒ tudo visível
  // (retrocompat: chamadas que não passam o mapa não escondem nada).
  visibility?: DashboardVisibility
}

/**
 * Dashboard da clínica — REDESIGN Senno (prompt/Senno Redesign/Dashboard).
 * Estrutura do corpo (handoff §1): setores de KPI (Financeiro · Comercial ·
 * Operação) → [gráfico Receita×Custos | Metas] → [donut Origem | Receita por
 * procedimento] → [Próximos agendamentos | Funil | Insights]. A barra de
 * período vive na page (acima deste componente).
 *
 * Deltas com pill só nos 4 KPIs definidos no redesign (faturamento, lucro,
 * custos, ticket médio); custos sobem = ruim (pill vermelha com seta p/ cima).
 * Cada widget some conforme o mapa de visibilidade por cargo; a linha
 * re-flui (o irmão vira largura cheia) em vez de deixar buraco.
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
    upcomingAppointments,
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

  const showNoShow = vis('commercialKpis', 'noShow')
  const showAttendance = vis('commercialKpis', 'attendance')
  const showLostRevenue = vis('financialKpis', 'lostRevenue')

  // "Tempo até 1º contato" só aparece com dado real (nada escreve
  // `firstContactAt` hoje; volta sozinho quando a integração instrumentar).
  const showTimeToFirstContact =
    vis('commercialKpis', 'timeToFirstContact') && kpis.commercial.avgTimeToFirstContactMin != null

  // Sub da Conversão usa a meta ativa de conversão quando existe.
  const conversionGoal = goalsProgress.find((g) => g.metric === 'CONVERSION_RATE')
  const conversionSub = conversionGoal
    ? `meta ${Math.round(conversionGoal.targetValue * 100)}%`
    : 'sobre leads do período'

  // ---- Setor Financeiro ----
  const financeiro: React.ReactNode[] = []
  if (vis('financialKpis', 'revenue')) {
    financeiro.push(
      <SennoKpiCard
        key="revenue"
        icon={Banknote}
        label="Faturamento"
        value={formatBRL0(kpis.financial.totalRevenue)}
        delta={data.kpis.revenueGrowthMoM}
        sub="vs. período anterior"
      />
    )
  }
  if (vis('financialKpis', 'netProfit')) {
    financeiro.push(
      <SennoKpiCard
        key="netProfit"
        icon={TrendingUp}
        label="Lucro líquido"
        value={formatBRL0(kpis.financial.netProfit)}
        delta={rel(kpis.financial.netProfit, prev.financial.netProfit)}
        sub="líquido no período"
      />
    )
  }
  if (vis('financialKpis', 'costs')) {
    financeiro.push(
      <SennoKpiCard
        key="costs"
        icon={Wallet}
        label="Custos"
        value={formatBRL0(kpis.financial.totalCosts)}
        delta={rel(kpis.financial.totalCosts, prev.financial.totalCosts)}
        invertDelta
        sub="no período"
      />
    )
  }
  if (vis('financialKpis', 'netMargin')) {
    financeiro.push(
      <SennoKpiCard
        key="netMargin"
        icon={BarChart3}
        label="Margem líquida"
        value={formatPercent(kpis.financial.netMargin)}
        sub="sobre o faturamento"
      />
    )
  }
  if (!showNoShow && showLostRevenue) {
    financeiro.push(
      <SennoKpiCard
        key="lostRevenue"
        icon={Receipt}
        label="Receita perdida"
        value={formatBRL0(kpis.financial.estimatedLostRevenue)}
        sub="agendamentos em no-show"
        info={<p>Soma do preço dos procedimentos em no-show.</p>}
      />
    )
  }

  // ---- Setor Comercial · aquisição ----
  const comercial: React.ReactNode[] = []
  if (vis('commercialKpis', 'leads')) {
    comercial.push(
      <SennoKpiCard
        key="leads"
        icon={Filter}
        label="Leads totais"
        value={String(kpis.commercial.leadsCount)}
        sub="no período"
      />
    )
  }
  if (vis('commercialKpis', 'conversion')) {
    comercial.push(
      <SennoKpiCard
        key="conversion"
        icon={Target}
        label="Conversão"
        value={formatPercent(kpis.commercial.conversionRate)}
        sub={conversionSub}
      />
    )
  }
  if (vis('financialKpis', 'cac')) {
    comercial.push(
      <SennoKpiCard
        key="cac"
        icon={Tag}
        label="CAC"
        value={formatBRL0(kpis.financial.cac)}
        sub="custo por novo paciente"
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
  if (vis('financialKpis', 'roi')) {
    comercial.push(
      <SennoKpiCard
        key="roi"
        icon={Zap}
        label="ROI marketing"
        value={kpis.financial.roi != null ? `${(kpis.financial.roi * 100).toFixed(0)}%` : '—'}
        sub="retorno sobre investimento"
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
  if (showTimeToFirstContact) {
    comercial.push(
      <SennoKpiCard
        key="timeToFirstContact"
        icon={Clock}
        label="Tempo até 1º contato"
        value={`${kpis.commercial.avgTimeToFirstContactMin} min`}
        sub="média no período"
      />
    )
  }

  // ---- Setor Operação · atendimento ----
  const operacao: React.ReactNode[] = []
  if (vis('commercialKpis', 'appointments')) {
    operacao.push(
      <SennoKpiCard
        key="appointments"
        icon={Calendar}
        label="Agendamentos"
        value={String(kpis.commercial.appointmentsCount)}
        sub="no período"
      />
    )
  }
  if (showNoShow) {
    operacao.push(
      <SennoKpiCard
        key="noShow"
        icon={UserX}
        label="No-show"
        value={formatPercent(kpis.commercial.noShowRate)}
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
        {showLostRevenue && (
          <p className="text-[11.5px] text-muted-foreground">
            Receita perdida: {formatBRL0(kpis.financial.estimatedLostRevenue)}
          </p>
        )}
      </SennoKpiCard>
    )
  } else if (showAttendance) {
    operacao.push(
      <SennoKpiCard
        key="attendance"
        icon={UserCheck}
        label="Comparecimento"
        value={formatPercent(kpis.commercial.attendanceRate)}
        sub="dos desfechos conhecidos"
      />
    )
  }
  if (vis('financialKpis', 'averageTicket')) {
    operacao.push(
      <SennoKpiCard
        key="averageTicket"
        icon={Receipt}
        label="Ticket médio"
        value={formatBRL0(kpis.financial.averageTicket)}
        delta={rel(kpis.financial.averageTicket, prev.financial.averageTicket)}
        sub="por paciente"
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
  if (vis('financialKpis', 'healthScore')) {
    operacao.push(
      <SennoKpiCard
        key="healthScore"
        icon={Heart}
        label="Health Score"
        value={kpis.healthScore != null ? String(kpis.healthScore) : '—'}
        sub={kpis.healthScore != null ? `de 100 · ${healthLabel(kpis.healthScore)}` : 'sem dados'}
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
              Faixas: <span className="font-medium text-destructive">0–40 crítico</span>
              {' · '}
              <span className="font-medium text-warn">41–60 atenção</span>
              {' · '}
              <span className="font-medium">61–80 bom</span>
              {' · '}
              <span className="font-medium text-ok">81–100 excelente</span>.
            </p>
          </>
        }
      />
    )
  }

  const sectors = [
    { name: 'Financeiro', cards: financeiro },
    { name: 'Comercial · aquisição', cards: comercial },
    { name: 'Operação · atendimento', cards: operacao },
  ].filter((s) => s.cards.length > 0)

  // ---- Linhas de widgets ----
  const showRevGenerated = vis('revenueCharts', 'revenueGenerated')
  const showRevReceived = vis('revenueCharts', 'revenueReceived')
  const showChart = showRevGenerated || showRevReceived
  const showGoals = vis('tracking', 'goals')
  const showLeadsSource = vis('distributions', 'leadsBySource')
  const showRevByProcedure = vis('distributions', 'revenueByProcedure')
  const showUpcoming = vis('tracking', 'upcomingAppointments')
  const showFunnel = vis('revenueCharts', 'funnel')
  const showInsights = vis('tracking', 'insights')

  const generatedMonths = revenueByMonth.map((m) => ({
    label: m.month,
    revenue: m.revenue,
    costs: m.costs,
  }))
  // "Recebida" no dashboard = caixa REALIZADO (meses passados + atual). A
  // projeção futura continua na aba Financeiro, que reusa a mesma série.
  const receivedMonths = receivedByMonth.slice(0, receivedCenterIndex + 1).map((m) => ({
    label: m.month,
    revenue: m.revenue,
    costs: m.costs,
  }))

  const row1: React.ReactNode[] = []
  if (showChart) {
    row1.push(
      <RevenueCostChart
        key="chart"
        generated={generatedMonths}
        received={receivedMonths}
        showGenerated={showRevGenerated}
        showReceived={showRevReceived}
      />
    )
  }
  if (showGoals) row1.push(<GoalsCard key="goals" goals={goalsProgress} />)

  const row2: React.ReactNode[] = []
  if (showLeadsSource) {
    row2.push(
      <LeadSourcesDonut
        key="leadsSource"
        items={leadsBySource.map((s) => ({
          label: LEAD_SOURCE_LABEL[s.source] ?? s.source,
          count: s.count,
        }))}
      />
    )
  }
  if (showRevByProcedure) {
    row2.push(
      <ProceduresBarsCard
        key="revenueByProcedure"
        items={revenueByProcedure.map((p) => ({ name: p.name, total: p.total }))}
      />
    )
  }

  const row3: React.ReactNode[] = []
  if (showUpcoming) {
    row3.push(<UpcomingAppointmentsCard key="upcoming" items={upcomingAppointments} />)
  }
  if (showFunnel) row3.push(<ConversionFunnelCard key="funnel" stages={funnel} />)
  if (showInsights) row3.push(<InsightsCard key="insights" insights={insightsOpen} />)

  return (
    <div className="flex flex-col gap-[18px]">
      {sectors.map((sec) => (
        <div key={sec.name}>
          <div className="mb-2.5 ml-0.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            {sec.name}
          </div>
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(228px,1fr))]">
            {sec.cards}
          </div>
        </div>
      ))}

      {row1.length > 0 && (
        <div
          className={
            row1.length === 2
              ? 'grid grid-cols-1 gap-[18px] lg:grid-cols-[1.7fr_1fr]'
              : 'grid grid-cols-1 gap-[18px]'
          }
        >
          {row1}
        </div>
      )}

      {row2.length > 0 && (
        <div
          className={
            row2.length === 2
              ? 'grid grid-cols-1 items-stretch gap-[18px] lg:grid-cols-[0.8fr_1.85fr]'
              : 'grid grid-cols-1 gap-[18px]'
          }
        >
          {row2}
        </div>
      )}

      {row3.length > 0 && (
        <div
          className={
            row3.length === 3
              ? 'grid grid-cols-1 items-start gap-[18px] sm:grid-cols-2 lg:grid-cols-[0.95fr_0.9fr_1.55fr]'
              : row3.length === 2
                ? 'grid grid-cols-1 items-start gap-[18px] sm:grid-cols-2'
                : 'grid grid-cols-1 gap-[18px]'
          }
        >
          {row3}
        </div>
      )}
    </div>
  )
}
