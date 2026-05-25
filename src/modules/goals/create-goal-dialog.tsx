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

import { METRIC_LABEL, PERIOD_LABEL, type GoalAssignTarget, type GoalView } from './types'

type Props = {
  clientId: string
  // Etapa 2: alvos p/ atribuição. Vazios + canAssign=false ⇒ só meta da clínica.
  users?: GoalAssignTarget[]
  roles?: GoalAssignTarget[]
  canAssign?: boolean
}

type ScopeType = 'CLINIC' | 'USER' | 'ROLE'
type Mode = 'INDIVIDUAL' | 'SHARED'

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

export function CreateGoalDialog({ clientId, users = [], roles = [], canAssign = false }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [metric, setMetric] = useState<GoalView['metric']>('REVENUE')
  const [period, setPeriod] = useState<GoalView['period']>('MONTHLY')
  const [targetValue, setTargetValue] = useState('')
  const [startDate, setStartDate] = useState(isoToday())
  const [endDate, setEndDate] = useState(defaultEndForPeriod('MONTHLY'))
  const [notes, setNotes] = useState('')

  // Escopo (Etapa 2). Só aparece se o usuário pode atribuir a outros.
  const [scopeType, setScopeType] = useState<ScopeType>('CLINIC')
  const [mode, setMode] = useState<Mode>('INDIVIDUAL')
  const [assigneeUserId, setAssigneeUserId] = useState('')
  const [assigneeRoleId, setAssigneeRoleId] = useState('')

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
        scopeType,
        mode: scopeType === 'CLINIC' ? 'SHARED' : mode,
        assigneeUserId: scopeType === 'USER' ? assigneeUserId || null : null,
        assigneeRoleId: scopeType === 'ROLE' ? assigneeRoleId || null : null,
      })
      if (r.success) {
        toast.success('Meta criada')
        setOpen(false)
        setTargetValue('')
        setNotes('')
        setScopeType('CLINIC')
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

          {canAssign && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="space-y-1">
                <Label>Para quem é a meta?</Label>
                <Select value={scopeType} onValueChange={(v) => setScopeType(v as ScopeType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLINIC">Clínica (coletiva)</SelectItem>
                    <SelectItem value="USER">Um usuário</SelectItem>
                    <SelectItem value="ROLE">Um cargo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {scopeType === 'USER' && (
                <div className="space-y-1">
                  <Label>Usuário</Label>
                  <Select value={assigneeUserId} onValueChange={setAssigneeUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {scopeType === 'ROLE' && (
                <div className="space-y-1">
                  <Label>Cargo</Label>
                  <Select value={assigneeRoleId} onValueChange={setAssigneeRoleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {scopeType !== 'CLINIC' && (
                <div className="space-y-1">
                  <Label>Modo</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INDIVIDUAL">Individual — cada um cumpre a cota</SelectItem>
                      <SelectItem value="SHARED">Compartilhada — soma do grupo</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {mode === 'INDIVIDUAL'
                      ? 'O valor alvo vale para cada pessoa.'
                      : 'O valor alvo é a soma de todos juntos.'}
                  </p>
                </div>
              )}
            </div>
          )}

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
