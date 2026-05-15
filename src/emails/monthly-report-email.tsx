import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Row,
  Column,
} from '@react-email/components'
type KpiItem = { label: string; value: string }

type Props = {
  clinicName: string
  period: string
  kpis: KpiItem[]
  dashboardUrl: string
  pdfUrl: string
}

export function MonthlyReportEmail({ clinicName, period, kpis, dashboardUrl, pdfUrl }: Props) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>
        Relatório mensal de {clinicName} — {period}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>KPI Clinic OS</Heading>
          <Text style={subheading}>{clinicName}</Text>
          <Text style={text}>
            Segue o resumo de desempenho do período <strong>{period}</strong>.
          </Text>

          <Section style={kpiGrid}>
            {kpis.map((k) => (
              <Row key={k.label} style={kpiRow}>
                <Column style={kpiLabel}>{k.label}</Column>
                <Column style={kpiValue}>{k.value}</Column>
              </Row>
            ))}
          </Section>

          <Hr style={hr} />

          <Section style={{ textAlign: 'center' as const, marginTop: 20 }}>
            <Button href={pdfUrl} style={{ ...button, marginRight: 12 }}>
              Baixar PDF
            </Button>
            <Button href={dashboardUrl} style={{ ...button, backgroundColor: '#3f3f46' }}>
              Ver dashboard
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={muted}>
            Este relatório é gerado automaticamente pelo KPI Clinic OS. Para deixar de receber,
            entre em contato com o seu gestor.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return (v * 100).toFixed(1) + '%'
}

export function buildKpiItems(kpis: {
  totalRevenue: number
  totalCosts: number
  netProfit: number
  netMargin: number | null
  leadsCount: number
  conversionRate: number | null
  noShowRate: number | null
  averageTicket: number | null
}): KpiItem[] {
  return [
    { label: 'Faturamento', value: fmtBRL(kpis.totalRevenue) },
    { label: 'Custos', value: fmtBRL(kpis.totalCosts) },
    { label: 'Lucro líquido', value: fmtBRL(kpis.netProfit) },
    { label: 'Margem líquida', value: fmtPct(kpis.netMargin) },
    { label: 'Leads', value: String(kpis.leadsCount) },
    { label: 'Conversão', value: fmtPct(kpis.conversionRate) },
    { label: 'No-show', value: fmtPct(kpis.noShowRate) },
    { label: 'Ticket médio', value: kpis.averageTicket != null ? fmtBRL(kpis.averageTicket) : '—' },
  ]
}

const body = { backgroundColor: '#f4f4f5', fontFamily: 'system-ui, -apple-system, sans-serif' }
const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '32px 24px',
  maxWidth: 560,
  borderRadius: 8,
}
const heading = { color: '#059669', fontSize: 20, fontWeight: 700, margin: 0 }
const subheading = {
  color: '#18181b',
  fontSize: 16,
  fontWeight: 600,
  marginTop: 4,
  marginBottom: 16,
}
const text = { color: '#3f3f46', fontSize: 14, lineHeight: '22px' }
const muted = { color: '#71717a', fontSize: 12, lineHeight: '18px' }
const hr = { borderColor: '#e4e4e7', margin: '20px 0' }
const kpiGrid = { backgroundColor: '#f4f4f5', borderRadius: 6, padding: '8px 12px' }
const kpiRow = { marginBottom: 4 }
const kpiLabel = { color: '#71717a', fontSize: 12, width: '60%' }
const kpiValue = { color: '#18181b', fontSize: 13, fontWeight: 600, textAlign: 'right' as const }
const button = {
  backgroundColor: '#059669',
  color: '#ffffff',
  padding: '11px 22px',
  borderRadius: 6,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
  display: 'inline-block',
}
