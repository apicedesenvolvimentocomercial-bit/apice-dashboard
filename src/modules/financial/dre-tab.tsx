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
import { getDreReportAction } from '@/server/actions/dre-actions'
import { formatarBRL, formatarPercentual } from '@/server/services/dre/calcular-dre'
import type { DreReport } from '@/server/queries/dre-queries'
import type { Period } from '@/server/services/kpi/types'

type PeriodOption = 'month' | 'quarter' | 'year' | 'custom'

function yearRange(): { from: string; to: string } {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

type Row = {
  label: string
  value: number
  kind: 'subtotal' | 'deduction' | 'item' | 'result'
  margin?: number | null
}

function buildRows(r: DreReport): Row[] {
  const { input: i, output: o } = r
  const item = (label: string, value: number): Row[] =>
    value ? [{ label, value, kind: 'item' as const }] : []
  return [
    { label: 'Receita Bruta', value: o.receitaBruta, kind: 'subtotal' },
    ...item('Procedimentos', i.receitaProcedimentos ?? 0),
    ...item('Pacotes', i.receitaPacotes ?? 0),
    ...item('Recorrência', i.receitaRecorrencia ?? 0),
    ...item('Produtos', i.receitaProdutos ?? 0),
    ...item('Outras', i.outrasReceitas ?? 0),
    { label: '(−) Deduções', value: -o.deducoes, kind: 'deduction' },
    ...item('Impostos sobre receita', -(i.impostosSobreReceita ?? 0)),
    ...item('Cancelamentos', -(i.cancelamentos ?? 0)),
    ...item('Inadimplência', -(i.inadimplencia ?? 0)),
    ...item('Descontos', -(i.descontos ?? 0)),
    { label: 'Receita Líquida', value: o.receitaLiquida, kind: 'subtotal' },
    { label: '(−) Custo dos serviços (CSP)', value: -o.csp, kind: 'deduction' },
    ...item('Custo de produtos/procedimentos', -(i.custoProdutos ?? 0)),
    ...item('Comissões', -(i.comissoes ?? 0)),
    ...item('Custos operacionais diretos', -(i.custosOperacionaisDiretos ?? 0)),
    { label: 'Lucro Bruto', value: o.lucroBruto, kind: 'subtotal', margin: o.margemBruta },
    { label: '(−) Despesas Operacionais', value: -o.despesasOperacionais, kind: 'deduction' },
    ...item('Marketing', -(i.despesasMarketing ?? 0)),
    ...item('Comerciais', -(i.despesasComerciais ?? 0)),
    ...item('Administrativas', -(i.despesasAdministrativas ?? 0)),
    { label: 'EBITDA', value: o.ebitda, kind: 'subtotal', margin: o.margemEbitda },
    { label: '(−) Depreciação e Amortização', value: -o.depreciacaoAmortizacao, kind: 'deduction' },
    { label: 'EBIT (resultado operacional)', value: o.ebit, kind: 'subtotal' },
    { label: 'Resultado Financeiro', value: o.resultadoFinanceiro, kind: 'item' },
    { label: 'LAIR (lucro antes do IR)', value: o.lair, kind: 'subtotal' },
    ...(o.impostoSobreLucro
      ? [
          {
            label: '(−) Imposto sobre o lucro',
            value: -o.impostoSobreLucro,
            kind: 'deduction' as const,
          },
        ]
      : []),
    { label: 'Lucro Líquido', value: o.lucroLiquido, kind: 'result', margin: o.margemLiquida },
  ]
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

  const rows = report ? buildRows(report) : []

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
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando DRE…
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((row, idx) => (
                <DreRow key={idx} row={row} />
              ))}
            </div>
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

function DreRow({ row }: { row: Row }) {
  const isSubtotal = row.kind === 'subtotal' || row.kind === 'result'
  const isResult = row.kind === 'result'
  const isItem = row.kind === 'item' || row.kind === 'deduction'
  return (
    <div
      className={[
        'flex items-center justify-between gap-4 px-4 py-2.5',
        isResult ? 'bg-primary/5' : '',
        isSubtotal ? 'font-semibold' : '',
        isItem ? 'pl-8 text-sm text-muted-foreground' : '',
      ].join(' ')}
    >
      <span className={isResult ? 'text-base' : ''}>{row.label}</span>
      <div className="flex items-center gap-3">
        {row.margin != null && (
          <span className="text-xs text-muted-foreground">{formatarPercentual(row.margin)}</span>
        )}
        <span
          className={[
            'tabular-nums',
            isResult ? 'text-base font-bold' : '',
            row.value < 0 ? 'text-muted-foreground' : '',
          ].join(' ')}
        >
          {formatarBRL(row.value)}
        </span>
      </div>
    </div>
  )
}
