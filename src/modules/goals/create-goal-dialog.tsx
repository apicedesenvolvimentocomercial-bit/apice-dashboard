'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createGoalAction } from '@/server/actions/goal-actions'

import { METRIC_LABEL, PERIOD_LABEL, type GoalView } from './types'

type Props = { clientId: string }

const METRICS = Object.keys(METRIC_LABEL) as GoalView['metric'][]
const PERIODS = Object.keys(PERIOD_LABEL) as GoalView['period'][]

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function defaultEndForPeriod(period: GoalView['period']): string {
  const d = new Date()
  if (period === 'MONTHLY') d.setMonth(d.getMonth() + 1)
  else if (period === 'QUARTERLY') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export function CreateGoalDialog({ clientId }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [metric, setMetric] = useState<GoalView['metric']>('REVENUE')
  const [period, setPeriod] = useState<GoalView['period']>('MONTHLY')
  const [targetValue, setTargetValue] = useState('')
  const [startDate, setStartDate] = useState(isoToday())
  const [endDate, setEndDate] = useState(defaultEndForPeriod('MONTHLY'))
  const [notes, setNotes] = useState('')

  const handlePeriodChange = (next: GoalView['period']) => {
    setPeriod(next)
    setEndDate(defaultEndForPeriod(next))
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const r = await createGoalAction(clientId, {
        metric,
        period,
        targetValue: Number(targetValue),
        startDate,
        endDate,
        notes: notes || undefined,
      })
      if (r.success) {
        toast.success('Meta criada')
        setOpen(false)
        setTargetValue('')
        setNotes('')
      } else {
        toast.error(r.error.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nova meta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova meta</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Métrica</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as GoalView['metric'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {METRIC_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Período</Label>
              <Select
                value={period}
                onValueChange={(v) => handlePeriodChange(v as GoalView['period'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PERIOD_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="target">Valor alvo</Label>
            <Input
              id="target"
              type="number"
              step="0.01"
              min="0"
              required
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="startDate">Início</Label>
              <DateInput
                id="startDate"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate">Fim</Label>
              <DateInput
                id="endDate"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Observações</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Criar meta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
