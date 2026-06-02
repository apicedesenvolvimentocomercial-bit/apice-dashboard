'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

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
import { getConsolidatedDreReportAction } from '@/server/actions/dre-actions'
import { formatarBRL, formatarPercentual } from '@/server/services/dre/calcular-dre'
import type { ConsolidatedDreReport } from '@/server/queries/dre-queries'
import type { Period } from '@/server/services/kpi/types'

import { DreReportTable } from './dre-report-table'

type PeriodOption = 'month' | 'quarter' | 'year' | 'custom'

function yearRange(): { from: string; to: string } {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

/** DRE consolidada (todas as clínicas da org) — Dashboard do admin. */
export function ConsolidatedDre() {
  const [period, setPeriod] = useState<PeriodOption>('month')
  const [custom, setCustom] = useState<{ from: string; to: string }>(yearRange())
  const [report, setReport] = useState<ConsolidatedDreReport | null>(null)
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
    getConsolidatedDreReportAction(opts).then((res) => {
      if (!active) return
      if (res.success) setReport(res.data)
      else toast.error(res.error.message)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [period, custom])

  const byClinic = report?.byClinic ?? []

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
      </div>

      <Card>
        <CardContent className="p-0">
          {loading || !report ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando DRE consolidada…
            </div>
          ) : (
            <DreReportTable input={report.input} output={report.output} />
          )}
        </CardContent>
      </Card>

      {byClinic.length > 1 && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm font-semibold text-muted-foreground">
                <span>Por clínica</span>
                <span>Lucro líquido</span>
              </div>
              {byClinic.map((c) => (
                <div
                  key={c.clientId}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <span>{c.clientName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {formatarPercentual(c.output.margemLiquida)}
                    </span>
                    <span
                      className={[
                        'font-medium tabular-nums',
                        c.output.lucroLiquido < 0 ? 'text-destructive' : '',
                      ].join(' ')}
                    >
                      {formatarBRL(c.output.lucroLiquido)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Regime de competência, somando todas as clínicas da agência no período. O imposto sobre o
        lucro respeita o regime tributário de cada clínica.
      </p>
    </div>
  )
}
