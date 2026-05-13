'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { deleteGoalAction } from '@/server/actions/goal-actions'

import { METRIC_LABEL, PERIOD_LABEL, type GoalView } from './types'

type Props = {
  clientId: string
  goal: GoalView
}

function formatValue(metric: GoalView['metric'], value: number): string {
  if (metric === 'REVENUE' || metric === 'AVERAGE_TICKET') return formatCurrency(value)
  if (metric === 'CONVERSION_RATE' || metric === 'NO_SHOW_RATE') {
    return `${(value * 100).toFixed(1)}%`
  }
  return value.toLocaleString('pt-BR')
}

export function GoalCard({ clientId, goal }: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const projectionTone =
    goal.projectedAtPace == null
      ? 'text-muted-foreground'
      : goal.projectedAtPace >= goal.targetValue
        ? 'text-emerald-600'
        : goal.projectedAtPace >= goal.targetValue * 0.8
          ? 'text-amber-600'
          : 'text-rose-600'

  const confirmDelete = () => {
    startTransition(async () => {
      const r = await deleteGoalAction(goal.id, clientId)
      if (r.success) {
        toast.success('Meta excluída')
        setConfirmOpen(false)
      } else {
        toast.error(r.error.message)
      }
    })
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{METRIC_LABEL[goal.metric]}</p>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
              <Badge variant="outline">{PERIOD_LABEL[goal.period]}</Badge>
              <Badge variant="secondary">{goal.daysLeft}d restantes</Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending}
            aria-label="Excluir meta"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir esta meta?</AlertDialogTitle>
                <AlertDialogDescription>
                  A meta &ldquo;{METRIC_LABEL[goal.metric]}&rdquo; será removida. Esta ação pode ser
                  revertida via histórico, mas pare de aparecer no acompanhamento atual.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    confirmDelete()
                  }}
                  disabled={isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isPending ? 'Excluindo...' : 'Excluir'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{formatValue(goal.metric, goal.currentValue)}</span>
            <span className="text-muted-foreground">
              de {formatValue(goal.metric, goal.targetValue)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, goal.progressPct)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {goal.progressPct.toFixed(0)}% atingido
          </p>
        </div>

        {goal.projectedAtPace != null && (
          <p className={`text-xs ${projectionTone}`}>
            Projeção no ritmo atual: {formatValue(goal.metric, goal.projectedAtPace)}
          </p>
        )}

        {goal.notes && <p className="text-xs text-muted-foreground">{goal.notes}</p>}
      </CardContent>
    </Card>
  )
}
