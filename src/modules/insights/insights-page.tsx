'use client'

import { useMemo, useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { recalculateInsightsAction } from '@/server/actions/insight-actions'

import { InsightCard } from './insight-card'
import { statusLabel } from './labels'

type Insight = React.ComponentProps<typeof InsightCard>['insight']

type Props = {
  clientId: string
  insights: Insight[]
}

const STATUS_TABS = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'] as const

export function InsightsPage({ clientId, insights }: Props) {
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>('OPEN')
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => insights.filter((i) => i.status === status), [insights, status])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of insights) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [insights])

  const openInsights = insights.filter((i) =>
    ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(i.status)
  )
  const critical = openInsights.filter((i) => i.severity === 'CRITICAL').length
  const warning = openInsights.filter((i) => i.severity === 'WARNING').length
  const info = openInsights.filter((i) => i.severity === 'INFO').length

  const recalc = () => {
    startTransition(async () => {
      const r = await recalculateInsightsAction(clientId)
      if (r.success) {
        toast.success(
          `Insights recalculados (${r.data.created} novos, ${r.data.resolved} resolvidos)`
        )
      } else {
        toast.error('Falha ao recalcular')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
          <p className="text-muted-foreground">
            Diagnósticos automáticos e recomendações para sua clínica
          </p>
        </div>
        <Button onClick={recalc} disabled={isPending} variant="outline" size="sm">
          <RefreshCw className={isPending ? 'animate-spin' : ''} />
          Recalcular
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-l-4 border-l-rose-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Críticos abertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{critical}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Avisos abertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{warning}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-sky-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Informativos abertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{info}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b" role="tablist">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={
              status === s
                ? 'border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary'
                : 'border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground'
            }
          >
            {statusLabel(s)} {counts[s] ? `(${counts[s]})` : ''}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Nenhum insight em "{statusLabel(status)}".
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      )}
    </div>
  )
}
