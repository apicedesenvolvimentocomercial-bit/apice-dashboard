import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ClinicReportData = {
  clinicName: string
  period: { from: Date; to: Date }
  generatedAt: Date
  kpis: {
    totalRevenue: number
    totalCosts: number
    netProfit: number
    netMargin: number | null
    leadsCount: number
    appointmentsCount: number
    conversionRate: number | null
    noShowRate: number | null
    averageTicket: number
    healthScore: number | null
  }
  revenueByMonth: { month: string; revenue: number; costs: number }[]
  topProcedures: { name: string; total: number; count: number }[]
  topCostCategories: { label: string; total: number }[]
  insightsOpen: { title: string; severity: string }[]
  goalsProgress: {
    metric: string
    progressPct: number
    targetValue: number
    currentValue: number
  }[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtPct(value: number | null): string {
  if (value == null) return '—'
  return (value * 100).toFixed(1) + '%'
}

function fmtDate(d: Date): string {
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const C = {
  primary: '#059669', // emerald-600
  danger: '#dc2626',
  warning: '#d97706',
  info: '#2563eb',
  muted: '#71717a',
  border: '#e4e4e7',
  bg: '#f4f4f5',
  white: '#ffffff',
  text: '#18181b',
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.text,
    padding: 36,
    backgroundColor: C.white,
  },
  // Header
  header: { marginBottom: 20 },
  headerTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.primary, marginBottom: 2 },
  headerSub: { fontSize: 9, color: C.muted },
  // Section
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    color: C.text,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 3,
  },
  // KPI grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kpiCard: { width: '22%', backgroundColor: C.bg, borderRadius: 4, padding: 7 },
  kpiLabel: { fontSize: 7, color: C.muted, marginBottom: 2 },
  kpiValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  kpiPositive: { color: C.primary },
  kpiNegative: { color: C.danger },
  // Table
  table: { borderWidth: 1, borderColor: C.border, borderRadius: 4 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tableLastRow: { flexDirection: 'row' },
  thCell: { padding: '4 6', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  tdCell: { padding: '4 6', fontSize: 8 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  textRight: { textAlign: 'right' },
  // Bar chart (simplified)
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  barLabel: { width: 50, fontSize: 7, color: C.muted },
  barTrack: { flex: 1, height: 8, backgroundColor: C.border, borderRadius: 2 },
  barFill: { height: 8, borderRadius: 2 },
  barValue: { width: 55, fontSize: 7, textAlign: 'right', color: C.muted },
  // Insight
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, gap: 6 },
  insightBadge: {
    fontSize: 7,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    color: C.white,
  },
  insightText: { flex: 1, fontSize: 8 },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: C.muted },
})

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function KpiCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text
        style={[
          s.kpiValue,
          positive === true ? s.kpiPositive : positive === false ? s.kpiNegative : {},
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>
}

function SEVERITY_COLOR(severity: string): string {
  if (severity === 'CRITICAL') return C.danger
  if (severity === 'WARNING') return C.warning
  return C.info
}

function SEVERITY_LABEL(severity: string): string {
  if (severity === 'CRITICAL') return 'Crítico'
  if (severity === 'WARNING') return 'Atenção'
  return 'Info'
}

// ---------------------------------------------------------------------------
// Main Document
// ---------------------------------------------------------------------------
export function ClinicReportPdf({ data }: { data: ClinicReportData }) {
  const maxRevenue = Math.max(...data.revenueByMonth.map((m) => Math.max(m.revenue, m.costs)), 1)

  return (
    <Document
      title={`Relatório — ${data.clinicName}`}
      author="KPI Clinic OS"
      subject="Relatório mensal"
    >
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>{data.clinicName}</Text>
          <Text style={s.headerSub}>
            Relatório de desempenho · {fmtDate(data.period.from)} a {fmtDate(data.period.to)}
          </Text>
          <Text style={s.headerSub}>Gerado em {fmtDate(data.generatedAt)} · KPI Clinic OS</Text>
        </View>

        {/* KPIs */}
        <View style={s.section}>
          <SectionTitle>Indicadores do período</SectionTitle>
          <View style={s.kpiGrid}>
            <KpiCard
              label="Faturamento"
              value={fmtBRL(data.kpis.totalRevenue)}
              positive={data.kpis.totalRevenue > 0}
            />
            <KpiCard label="Custos" value={fmtBRL(data.kpis.totalCosts)} />
            <KpiCard
              label="Lucro líquido"
              value={fmtBRL(data.kpis.netProfit)}
              positive={data.kpis.netProfit >= 0}
            />
            <KpiCard
              label="Margem líquida"
              value={fmtPct(data.kpis.netMargin)}
              positive={data.kpis.netMargin != null && data.kpis.netMargin >= 0.2}
            />
            <KpiCard label="Leads" value={String(data.kpis.leadsCount)} />
            <KpiCard label="Agendamentos" value={String(data.kpis.appointmentsCount)} />
            <KpiCard label="Conversão" value={fmtPct(data.kpis.conversionRate)} />
            <KpiCard
              label="No-show"
              value={fmtPct(data.kpis.noShowRate)}
              positive={data.kpis.noShowRate != null && data.kpis.noShowRate < 0.15}
            />
            <KpiCard label="Ticket médio" value={fmtBRL(data.kpis.averageTicket)} />
            <KpiCard
              label="Health Score"
              value={data.kpis.healthScore != null ? String(data.kpis.healthScore) : '—'}
            />
          </View>
        </View>

        {/* Revenue chart (simplified bars) */}
        {data.revenueByMonth.length > 0 && (
          <View style={s.section}>
            <SectionTitle>Receita x Custos — últimos meses</SectionTitle>
            {data.revenueByMonth.slice(-8).map((m) => (
              <View key={m.month}>
                <View style={s.barRow}>
                  <Text style={s.barLabel}>{m.month}</Text>
                  <View style={s.barTrack}>
                    <View
                      style={[
                        s.barFill,
                        { width: `${(m.revenue / maxRevenue) * 100}%`, backgroundColor: C.primary },
                      ]}
                    />
                  </View>
                  <Text style={s.barValue}>{fmtBRL(m.revenue)}</Text>
                </View>
                <View style={[s.barRow, { marginTop: -1 }]}>
                  <Text style={s.barLabel} />
                  <View style={s.barTrack}>
                    <View
                      style={[
                        s.barFill,
                        { width: `${(m.costs / maxRevenue) * 100}%`, backgroundColor: C.danger },
                      ]}
                    />
                  </View>
                  <Text style={s.barValue}>{fmtBRL(m.costs)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Top procedures */}
        {data.topProcedures.length > 0 && (
          <View style={s.section}>
            <SectionTitle>Receita por procedimento</SectionTitle>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.thCell, s.flex2]}>Procedimento</Text>
                <Text style={[s.thCell, s.flex1, s.textRight]}>Qtd</Text>
                <Text style={[s.thCell, s.flex1, s.textRight]}>Receita</Text>
              </View>
              {data.topProcedures.slice(0, 8).map((p, i) => (
                <View
                  key={i}
                  style={i < data.topProcedures.length - 1 ? s.tableRow : s.tableLastRow}
                >
                  <Text style={[s.tdCell, s.flex2]}>{p.name}</Text>
                  <Text style={[s.tdCell, s.flex1, s.textRight]}>{p.count}</Text>
                  <Text style={[s.tdCell, s.flex1, s.textRight]}>{fmtBRL(p.total)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Insights */}
        {data.insightsOpen.length > 0 && (
          <View style={s.section}>
            <SectionTitle>Insights ativos</SectionTitle>
            {data.insightsOpen.slice(0, 6).map((ins, i) => (
              <View key={i} style={s.insightRow}>
                <Text style={[s.insightBadge, { backgroundColor: SEVERITY_COLOR(ins.severity) }]}>
                  {SEVERITY_LABEL(ins.severity)}
                </Text>
                <Text style={s.insightText}>{ins.title}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Goals */}
        {data.goalsProgress.length > 0 && (
          <View style={s.section}>
            <SectionTitle>Metas</SectionTitle>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.thCell, s.flex2]}>Métrica</Text>
                <Text style={[s.thCell, s.flex1, s.textRight]}>Atual</Text>
                <Text style={[s.thCell, s.flex1, s.textRight]}>Meta</Text>
                <Text style={[s.thCell, s.flex1, s.textRight]}>Progresso</Text>
              </View>
              {data.goalsProgress.map((g, i) => (
                <View
                  key={i}
                  style={i < data.goalsProgress.length - 1 ? s.tableRow : s.tableLastRow}
                >
                  <Text style={[s.tdCell, s.flex2]}>{g.metric}</Text>
                  <Text style={[s.tdCell, s.flex1, s.textRight]}>
                    {g.currentValue.toLocaleString('pt-BR')}
                  </Text>
                  <Text style={[s.tdCell, s.flex1, s.textRight]}>
                    {g.targetValue.toLocaleString('pt-BR')}
                  </Text>
                  <Text style={[s.tdCell, s.flex1, s.textRight]}>{g.progressPct.toFixed(0)}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>KPI Clinic OS · {data.clinicName}</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
