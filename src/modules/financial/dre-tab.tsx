'use client'

import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { DateInput } from '@/components/ui/date-input'
import { cn } from '@/lib/utils'
import { getDreReportAction } from '@/server/actions/dre-actions'
import type { DreReport } from '@/server/queries/dre-queries'
import type { Period } from '@/server/services/kpi/types'

import { buildDreRows, DreReportTable } from './dre-report-table'
import { toCsv, withBom } from './types'

// Exporta a DRE do período como CSV (mesmas linhas da tabela: receita → lucro líquido).
function exportDreCsv(report: DreReport) {
  const rows = buildDreRows(report.input, report.output).map((r) => ({
    linha: r.label,
    valor: r.value.toFixed(2).replace('.', ','),
    margem: r.margin != null ? r.margin.toFixed(1).replace('.', ',') + '%' : '',
  }))
  const iso = (d: Date) => new Date(d).toISOString().slice(0, 10)
  const from = iso(report.range.from)
  const to = iso(report.range.to)
  const csv = toCsv(rows, ['linha', 'valor', 'margem'])
  const blob = new Blob([withBom(csv)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `dre-${from}-a-${to}.csv`
  link.click()
  URL.revokeObjectURL(url)
  toast.success('DRE exportada')
}

type PeriodOption = 'month' | 'quarter' | 'year' | 'custom'

const PERIODS: { key: PeriodOption; label: string }[] = [
  { key: 'month', label: 'Mês' },
  { key: 'quarter', label: 'Trimestre' },
  { key: 'year', label: 'Ano' },
  { key: 'custom', label: 'Personalizado' },
]

function yearRange(): { from: string; to: string } {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

/**
 * Aba DRE — redesign Senno (Financeiro-handoff §6): segmented dourado de
 * período com pílula deslizante + "Exportar CSV" à direita; tabela em cascata
 * num card único. "Personalizado" (4º segmento) preserva o recorte por datas
 * do produto — o protótipo só documenta Mês/Trimestre/Ano.
 */
export function DreTab({ clientId }: { clientId: string }) {
  const [period, setPeriod] = useState<PeriodOption>('month')
  const [custom, setCustom] = useState<{ from: string; to: string }>(yearRange())
  const [report, setReport] = useState<DreReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    const opts: { period?: Period; from?: string; to?: string } =
      period === 'year'
        ? { period: 'custom', ...yearRange() }
        : period === 'custom'
          ? { period: 'custom', from: custom.from, to: custom.to }
          : { period }
    getDreReportAction(clientId, opts).then((res) => {
      if (!active) return
      if (res.success) setReport(res.data)
      else toast.error(res.error.message)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [clientId, period, custom])

  const idx = PERIODS.findIndex((p) => p.key === period)

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Toolbar: segmented de período + Exportar CSV (handoff §6.1) ---- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="relative grid flex-none auto-cols-fr grid-flow-col rounded-[9px] border border-border bg-muted p-[3px]"
            role="tablist"
            aria-label="Período da DRE"
          >
            <div
              className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] z-0 rounded-[7px] bg-primary shadow-card transition-transform duration-340 ease-senno"
              style={{
                width: `calc((100% - 6px) / ${PERIODS.length})`,
                transform: `translateX(${idx * 100}%)`,
              }}
              aria-hidden="true"
            />
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={period === p.key}
                onClick={() => setPeriod(p.key)}
                className={cn(
                  'relative z-[1] whitespace-nowrap rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-250',
                  period === p.key ? 'text-primary-foreground' : 'text-muted-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <DateInput
                aria-label="De"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="h-9 w-36 text-xs"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <DateInput
                aria-label="Até"
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="h-9 w-36 text-xs"
              />
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={loading || !report}
          onClick={() => report && exportDreCsv(report)}
          className="inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-border bg-card px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar CSV
        </button>
      </div>

      {/* ---- Tabela DRE (handoff §6.2) ---- */}
      <div className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
        {loading || !report ? (
          <div>
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between gap-3 border-t border-border first:border-t-0',
                  i % 3 === 0 ? 'bg-muted/45 px-[18px] py-3.5' : 'py-[11px] pl-[30px] pr-[18px]'
                )}
              >
                <div className="senno-shimmer h-3 w-2/5 rounded" />
                <div className="senno-shimmer h-3 w-24 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <DreReportTable input={report.input} output={report.output} />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Regime de competência: receita reconhecida na data do faturamento. O recebimento (caixa) é
        rastreado em Contas a Receber.
      </p>
    </div>
  )
}
