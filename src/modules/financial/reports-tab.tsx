'use client'

import { Download } from 'lucide-react'
import { useTransition, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import { generateDreAction } from '@/server/actions/report-actions'
import {
  COST_TYPE_LABELS,
  formatCurrency,
  formatDateBr,
  formatPercent,
  toCsv,
  withBom,
} from './types'

type DreData = {
  from: string
  to: string
  revenues: { label: string; amount: number; count: number }[]
  costsByCategory: { label: string; type: string; amount: number; count: number }[]
  totalRevenue: number
  totalCost: number
  byCostType: { type: string; amount: number }[]
  profit: number
  margin: number
}

type Props = {
  clientId: string
}

function defaultRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    from: start.toISOString().split('T')[0],
    to: now.toISOString().split('T')[0],
  }
}

export function ReportsTab({ clientId }: Props) {
  const [isPending, startTransition] = useTransition()
  const initial = defaultRange()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [dre, setDre] = useState<DreData | null>(null)

  function handleGenerate() {
    if (!from || !to) {
      toast.error('Selecione o período')
      return
    }
    if (new Date(from) > new Date(to)) {
      toast.error('Data inicial maior que a final')
      return
    }
    startTransition(async () => {
      const result = await generateDreAction(clientId, { from, to })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      setDre(result.data)
    })
  }

  function handleExport() {
    if (!dre) return
    const rows: { secao: string; descricao: string; quantidade: string; valor: string }[] = []
    rows.push({
      secao: 'PERIODO',
      descricao: `${formatDateBr(dre.from)} a ${formatDateBr(dre.to)}`,
      quantidade: '',
      valor: '',
    })
    rows.push({ secao: '', descricao: '', quantidade: '', valor: '' })
    rows.push({ secao: 'RECEITAS', descricao: '', quantidade: '', valor: '' })
    for (const r of dre.revenues) {
      rows.push({
        secao: '',
        descricao: r.label,
        quantidade: String(r.count),
        valor: r.amount.toFixed(2).replace('.', ','),
      })
    }
    rows.push({
      secao: '',
      descricao: 'Total de receitas',
      quantidade: '',
      valor: dre.totalRevenue.toFixed(2).replace('.', ','),
    })
    rows.push({ secao: '', descricao: '', quantidade: '', valor: '' })
    rows.push({ secao: 'CUSTOS POR CATEGORIA', descricao: '', quantidade: '', valor: '' })
    for (const c of dre.costsByCategory) {
      rows.push({
        secao: '',
        descricao: `${c.label} (${COST_TYPE_LABELS[c.type] ?? c.type})`,
        quantidade: String(c.count),
        valor: c.amount.toFixed(2).replace('.', ','),
      })
    }
    rows.push({
      secao: '',
      descricao: 'Total de custos',
      quantidade: '',
      valor: dre.totalCost.toFixed(2).replace('.', ','),
    })
    rows.push({ secao: '', descricao: '', quantidade: '', valor: '' })
    rows.push({
      secao: 'RESULTADO',
      descricao: 'Lucro líquido',
      quantidade: '',
      valor: dre.profit.toFixed(2).replace('.', ','),
    })
    rows.push({
      secao: '',
      descricao: 'Margem',
      quantidade: '',
      valor: dre.margin.toFixed(1).replace('.', ',') + '%',
    })

    const csv = toCsv(rows, ['secao', 'descricao', 'quantidade', 'valor'])
    const blob = new Blob([withBom(csv)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dre-${dre.from}-a-${dre.to}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('DRE exportado')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3">
        <div className="space-y-1">
          <Label htmlFor="dre-from" className="text-xs">
            De
          </Label>
          <DateInput
            id="dre-from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-40"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dre-to" className="text-xs">
            Até
          </Label>
          <DateInput
            id="dre-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-40"
          />
        </div>
        <Button onClick={handleGenerate} disabled={isPending}>
          {isPending ? 'Gerando...' : 'Gerar DRE'}
        </Button>
        {dre && (
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        )}
      </div>

      {!dre ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Selecione um período e clique em &quot;Gerar DRE&quot;
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            DRE simplificado: Receita − Custos = Resultado.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Receita bruta</p>
                <p className="mt-1 text-lg font-bold text-green-700">
                  {formatCurrency(dre.totalRevenue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total de custos</p>
                <p className="mt-1 text-lg font-bold text-red-700">
                  {formatCurrency(dre.totalCost)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Resultado</p>
                <p
                  className={`mt-1 text-lg font-bold ${dre.profit < 0 ? 'text-red-700' : 'text-green-700'}`}
                >
                  {formatCurrency(dre.profit)}
                </p>
                <p className="text-xs text-muted-foreground">Margem: {formatPercent(dre.margin)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Receitas por procedimento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dre.revenues.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Sem receitas no período.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {dre.revenues.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5">{r.label}</td>
                          <td className="py-1.5 text-right text-muted-foreground">{r.count}×</td>
                          <td className="py-1.5 text-right font-medium text-green-700">
                            {formatCurrency(r.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-medium">
                        <td className="pt-2">Total</td>
                        <td />
                        <td className="pt-2 text-right text-green-700">
                          {formatCurrency(dre.totalRevenue)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Custos por categoria</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dre.costsByCategory.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Sem custos no período.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {dre.costsByCategory.map((c, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5">
                            {c.label}
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({COST_TYPE_LABELS[c.type] ?? c.type})
                            </span>
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground">{c.count}×</td>
                          <td className="py-1.5 text-right font-medium text-red-700">
                            {formatCurrency(c.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-medium">
                        <td className="pt-2">Total</td>
                        <td />
                        <td className="pt-2 text-right text-red-700">
                          {formatCurrency(dre.totalCost)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Custos por tipo</CardTitle>
            </CardHeader>
            <CardContent>
              {dre.byCostType.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Sem custos no período.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {dre.byCostType.map((c) => (
                    <div key={c.type} className="rounded border p-3">
                      <p className="text-xs text-muted-foreground">
                        {COST_TYPE_LABELS[c.type] ?? c.type}
                      </p>
                      <p className="mt-1 text-sm font-medium">{formatCurrency(c.amount)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
