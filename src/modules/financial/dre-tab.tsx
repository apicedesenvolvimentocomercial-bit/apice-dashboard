'use client'

import { Download, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

function yearRange(): { from: string; to: string } {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Período</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="quarter">Trimestre</SelectItem>
              <SelectItem value="year">Ano</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label>De</Label>
              <DateInput
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Até</Label>
              <DateInput
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </div>
          </>
        )}
        <Button
          variant="outline"
          className="ml-auto"
          disabled={loading || !report}
          onClick={() => report && exportDreCsv(report)}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading || !report ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando DRE…
            </div>
          ) : (
            <DreReportTable input={report.input} output={report.output} />
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Regime de competência: receita reconhecida na data do faturamento. O recebimento (caixa) é
        rastreado em Contas a Receber.
      </p>
    </div>
  )
}
