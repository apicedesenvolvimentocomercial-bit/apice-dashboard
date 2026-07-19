'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { ActionButton } from '@/components/ui/action-button'
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
import { createGoalAction, updateGoalAction } from '@/server/actions/goal-actions'
import { isPercentMetric } from '@/shared/goal-labels'

import { METRIC_LABEL, PERIOD_LABEL, type GoalAssignTarget, type GoalView } from './types'

// Métrica de %: banco guarda fração (0..1); o input mostra o número humano (60).
const pctRound = (n: number) => Math.round(n * 1e6) / 1e6
// Valor armazenado → exibido no input (×100 p/ %).
function toDisplayTarget(metric: GoalView['metric'], stored: number): string {
  return String(isPercentMetric(metric) ? pctRound(stored * 100) : stored)
}
// Valor digitado → armazenado (÷100 p/ %).
function toStoredTarget(metric: GoalView['metric'], display: number): number {
  return isPercentMetric(metric) ? display / 100 : display
}

// Meta existente para o modo edição: campos que o form edita.
export type GoalEditInitial = Pick<
  GoalView,
  | 'id'
  | 'metric'
  | 'period'
  | 'targetValue'
  | 'startDate'
  | 'endDate'
  | 'notes'
  | 'scopeType'
  | 'mode'
> & { assigneeUserId: string | null; assigneeRoleId: string | null }

type Props = {
  clientId: string
  // Etapa 2: alvos p/ atribuição. Vazios + canAssign=false ⇒ só meta da clínica.
  users?: GoalAssignTarget[]
  roles?: GoalAssignTarget[]
  canAssign?: boolean
  // Edição (Etapa 3 / lacuna 1). Ausente ⇒ criação (com trigger próprio).
  // Presente ⇒ edição, controlada externamente via open/onOpenChange.
  initial?: GoalEditInitial
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type ScopeType = 'CLINIC' | 'USER' | 'ROLE'
type Mode = 'INDIVIDUAL' | 'SHARED'

const METRICS = Object.keys(METRIC_LABEL) as GoalView['metric'][]
const PERIODS = Object.keys(PERIOD_LABEL) as GoalView['period'][]

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoOf(d: Date): string {
  return new Date(d).toISOString().slice(0, 10)
}

function defaultEndForPeriod(period: GoalView['period']): string {
  const d = new Date()
  if (period === 'MONTHLY') d.setMonth(d.getMonth() + 1)
  else if (period === 'QUARTERLY') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export function CreateGoalDialog({
  clientId,
  users = [],
  roles = [],
  canAssign = false,
  initial,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const isEdit = !!initial
  // Em edição o open é controlado pelo pai; em criação é interno.
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isEdit ? !!controlledOpen : internalOpen
  const setOpen = (v: boolean) => (isEdit ? onOpenChange?.(v) : setInternalOpen(v))

  const [isPending, startTransition] = useTransition()

  const [metric, setMetric] = useState<GoalView['metric']>(initial?.metric ?? 'REVENUE')
  const [period, setPeriod] = useState<GoalView['period']>(initial?.period ?? 'MONTHLY')
  const [targetValue, setTargetValue] = useState(
    initial ? toDisplayTarget(initial.metric, initial.targetValue) : ''
  )
  const [startDate, setStartDate] = useState(initial ? isoOf(initial.startDate) : isoToday())
  const [endDate, setEndDate] = useState(
    initial ? isoOf(initial.endDate) : defaultEndForPeriod('MONTHLY')
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')

  // Escopo (Etapa 2). Só aparece se o usuário pode atribuir a outros.
  const [scopeType, setScopeType] = useState<ScopeType>(initial?.scopeType ?? 'CLINIC')
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'INDIVIDUAL')
  const [assigneeUserId, setAssigneeUserId] = useState(initial?.assigneeUserId ?? '')
  const [assigneeRoleId, setAssigneeRoleId] = useState(initial?.assigneeRoleId ?? '')

  // Reidrata o form quando o alvo da edição muda (cards reaproveitam a instância).
  useEffect(() => {
    if (!initial) return
    setMetric(initial.metric)
    setPeriod(initial.period)
    setTargetValue(toDisplayTarget(initial.metric, initial.targetValue))
    setStartDate(isoOf(initial.startDate))
    setEndDate(isoOf(initial.endDate))
    setNotes(initial.notes ?? '')
    setScopeType(initial.scopeType)
    setMode(initial.mode)
    setAssigneeUserId(initial.assigneeUserId ?? '')
    setAssigneeRoleId(initial.assigneeRoleId ?? '')
  }, [initial])

  const handlePeriodChange = (next: GoalView['period']) => {
    setPeriod(next)
    if (!isEdit) setEndDate(defaultEndForPeriod(next))
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      metric,
      period,
      targetValue: toStoredTarget(metric, Number(targetValue)),
      startDate,
      endDate,
      notes: notes || undefined,
      scopeType,
      // CLINIC = sempre coletiva; USER = sempre individual (1 pessoa não tem
      // "conjunto"); só ROLE (grupo) escolhe entre individual/compartilhada.
      mode:
        scopeType === 'CLINIC'
          ? ('SHARED' as Mode)
          : scopeType === 'USER'
            ? ('INDIVIDUAL' as Mode)
            : mode,
      assigneeUserId: scopeType === 'USER' ? assigneeUserId || null : null,
      assigneeRoleId: scopeType === 'ROLE' ? assigneeRoleId || null : null,
    }
    startTransition(async () => {
      const r = initial
        ? await updateGoalAction(initial.id, clientId, payload)
        : await createGoalAction(clientId, payload)
      if (r.success) {
        toast.success(isEdit ? 'Meta atualizada' : 'Meta criada')
        setOpen(false)
        if (!isEdit) {
          setTargetValue('')
          setNotes('')
          setScopeType('CLINIC')
        }
      } else {
        toast.error(r.error.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEdit && (
        <DialogTrigger asChild>
          <ActionButton>
            <Plus aria-hidden="true" />
            Nova meta
          </ActionButton>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar meta' : 'Nova meta'}</DialogTitle>
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
                <Select
                  value={scopeType}
                  onValueChange={(v) => {
                    const next = v as ScopeType
                    setScopeType(next)
                    // Usuário sozinho não tem meta compartilhada — volta p/ individual.
                    if (next === 'USER') setMode('INDIVIDUAL')
                  }}
                >
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

              {/* Só cargo (grupo) escolhe modo. Clínica é sempre coletiva;
                  usuário sozinho é sempre individual. */}
              {scopeType === 'ROLE' && (
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
            <div className="relative">
              <Input
                id="target"
                type="number"
                step={isPercentMetric(metric) ? '0.1' : '0.01'}
                min="0"
                max={isPercentMetric(metric) ? '100' : undefined}
                required
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className={isPercentMetric(metric) ? 'pr-8' : undefined}
              />
              {isPercentMetric(metric) && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              )}
            </div>
            {isPercentMetric(metric) && (
              <p className="text-xs text-muted-foreground">
                Informe a porcentagem (ex.: 60 para 60%).
              </p>
            )}
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
              {isPending ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar meta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
