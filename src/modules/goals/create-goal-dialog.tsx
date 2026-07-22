'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { DateInput } from '@/components/ui/date-input'
import { FIELD_ERROR_SLOT } from '@/components/ui/field-error'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { MoneyInput } from '@/components/ui/money-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MAX_MONEY, formatMoneyBR, parseMoneyBR } from '@/lib/masks'
import { cn } from '@/lib/utils'
import { createGoalAction, updateGoalAction } from '@/server/actions/goal-actions'
import { isPercentMetric } from '@/shared/goal-labels'

import { METRIC_LABEL, PERIOD_LABEL, type GoalAssignTarget, type GoalView } from './types'

// Espelham as listas do `goalSchema` em `server/actions/goal-actions`.
const METRICS = [
  'REVENUE',
  'LEADS',
  'CONVERSION_RATE',
  'NO_SHOW_RATE',
  'AVERAGE_TICKET',
  'APPOINTMENTS',
  'NEW_PATIENTS',
] as const
const PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const
const SCOPE_TYPES = ['CLINIC', 'USER', 'ROLE'] as const
const MODES = ['INDIVIDUAL', 'SHARED'] as const

/**
 * Espelha `goalSchema` da action — mesmos limites, mensagens curtas (uma linha,
 * ver `field-error.tsx`). O servidor segue sendo a autoridade.
 *
 * `targetValue` viaja como TEXTO em pt-BR (`1234,56`): o campo usa a máscara
 * monetária (só dígitos + uma vírgula + 2 casas), então a conversão para número
 * acontece só na borda do submit.
 */
const schema = z
  .object({
    metric: z.enum(METRICS),
    period: z.enum(PERIODS),
    scopeType: z.enum(SCOPE_TYPES),
    mode: z.enum(MODES),
    assigneeUserId: z.string().max(30),
    assigneeRoleId: z.string().max(30),
    targetValue: z.string().min(1, 'Valor obrigatório').max(20, 'Valor muito grande'),
    startDate: z.string().min(1, 'Início obrigatório').max(30, 'Data inválida'),
    endDate: z.string().min(1, 'Fim obrigatório').max(30, 'Data inválida'),
  })
  .superRefine((d, ctx) => {
    const value = parseMoneyBR(d.targetValue)
    if (value === undefined || value <= 0) {
      ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'Deve ser maior que zero' })
    } else if (isPercentMetric(d.metric) && value > 100) {
      ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'Máximo 100%' })
    } else if (!isPercentMetric(d.metric) && value > MAX_MONEY) {
      ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'Valor muito alto' })
    }

    if (d.scopeType === 'USER' && !d.assigneeUserId) {
      ctx.addIssue({ code: 'custom', path: ['assigneeUserId'], message: 'Selecione o usuário' })
    }
    if (d.scopeType === 'ROLE' && !d.assigneeRoleId) {
      ctx.addIssue({ code: 'custom', path: ['assigneeRoleId'], message: 'Selecione o cargo' })
    }

    // Mesma regra da action (`endDate > startDate`). Datas ISO comparam como
    // texto, então basta o `<=` lexicográfico.
    if (d.startDate && d.endDate && d.endDate <= d.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Deve ser após o início' })
    }
  })

type Values = z.infer<typeof schema>

// Métrica de %: banco guarda fração (0..1); o input mostra o número humano (60).
const pctRound = (n: number) => Math.round(n * 1e6) / 1e6
// Valor armazenado → exibido no input (×100 p/ %). Inteiro sai sem centavos.
function toDisplayTarget(metric: GoalView['metric'], stored: number): string {
  const n = isPercentMetric(metric) ? pctRound(stored * 100) : stored
  return Number.isInteger(n) ? String(n) : formatMoneyBR(n)
}
// Valor digitado → armazenado (÷100 p/ %).
function toStoredTarget(metric: GoalView['metric'], display: number): number {
  return isPercentMetric(metric) ? display / 100 : display
}

// Meta existente para o modo edição: campos que o form edita.
export type GoalEditInitial = Pick<
  GoalView,
  'id' | 'metric' | 'period' | 'targetValue' | 'startDate' | 'endDate' | 'scopeType' | 'mode'
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

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoOf(d: Date): string {
  return new Date(d).toISOString().slice(0, 10)
}

function defaultEndForPeriod(period: Values['period']): string {
  const d = new Date()
  if (period === 'MONTHLY') d.setMonth(d.getMonth() + 1)
  else if (period === 'QUARTERLY') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

function toFormValues(initial?: GoalEditInitial): Values {
  if (!initial) {
    return {
      metric: 'REVENUE',
      period: 'MONTHLY',
      scopeType: 'CLINIC',
      mode: 'INDIVIDUAL',
      assigneeUserId: '',
      assigneeRoleId: '',
      targetValue: '',
      startDate: isoToday(),
      endDate: defaultEndForPeriod('MONTHLY'),
    }
  }
  return {
    metric: initial.metric,
    period: initial.period,
    scopeType: initial.scopeType,
    mode: initial.mode,
    assigneeUserId: initial.assigneeUserId ?? '',
    assigneeRoleId: initial.assigneeRoleId ?? '',
    targetValue: toDisplayTarget(initial.metric, initial.targetValue),
    startDate: isoOf(initial.startDate),
    endDate: isoOf(initial.endDate),
  }
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

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    // Valida SÓ ao sair do campo (mesma regra do diálogo de novo lead): com
    // 'onChange' o erro apareceria já na 1ª tecla.
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: toFormValues(initial),
  })

  const metric = form.watch('metric')
  const scopeType = form.watch('scopeType')
  const mode = form.watch('mode')
  const isPercent = isPercentMetric(metric)
  const loading = form.formState.isSubmitting

  // Reidrata o form a cada ABERTURA da edição (o card reaproveita a instância do
  // diálogo). As deps são primitivas de propósito: `initial` é um literal novo a
  // cada render do card, e reagir a ele apagaria o que o usuário está digitando.
  useEffect(() => {
    if (isEdit && open) form.reset(toFormValues(initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, initial?.id])

  async function onSubmit(v: Values) {
    const payload = {
      metric: v.metric,
      period: v.period,
      // `parseMoneyBR` já foi validado no schema — o `?? 0` é só p/ o tipo.
      targetValue: toStoredTarget(v.metric, parseMoneyBR(v.targetValue) ?? 0),
      startDate: v.startDate,
      endDate: v.endDate,
      scopeType: v.scopeType,
      // CLINIC = sempre coletiva; USER = sempre individual (1 pessoa não tem
      // "conjunto"); só ROLE (grupo) escolhe entre individual/compartilhada.
      mode: v.scopeType === 'CLINIC' ? 'SHARED' : v.scopeType === 'USER' ? 'INDIVIDUAL' : v.mode,
      assigneeUserId: v.scopeType === 'USER' ? v.assigneeUserId || null : null,
      assigneeRoleId: v.scopeType === 'ROLE' ? v.assigneeRoleId || null : null,
    }

    const r = initial
      ? await updateGoalAction(initial.id, clientId, payload)
      : await createGoalAction(clientId, payload)

    if (!r.success) {
      toast.error(r.error.message)
      return
    }

    toast.success(isEdit ? 'Meta atualizada' : 'Meta criada')
    setOpen(false)
    if (!isEdit) form.reset(toFormValues())
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isEdit) form.reset(toFormValues())
        setOpen(o)
      }}
    >
      {!isEdit && (
        <DialogTrigger asChild>
          <ActionButton>
            <Plus aria-hidden="true" />
            Nova meta
          </ActionButton>
        </DialogTrigger>
      )}
      {/* `max-h`/scroll é rede de segurança para telas baixas: com os espaços de
          erro reservados a altura é constante, então a barra não aparece. */}
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar meta' : 'Nova meta'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          {/* `space-y-3` (e não 4): com um slot de erro reservado sob CADA campo,
              o ritmo de 16px somava demais — mesmo padrão do "Novo Lead". */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="metric"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Métrica *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      {/* `bg-background` casa com o fundo do dialog — o
                          `bg-popover` padrão é mais claro no dark e destoava. */}
                      <SelectContent className="bg-background">
                        {METRICS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {METRIC_LABEL[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage reserve />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="period"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Período *</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v)
                        // Só na criação: em edição a data final é do usuário.
                        if (!isEdit) {
                          form.setValue('endDate', defaultEndForPeriod(v as Values['period']))
                        }
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-background">
                        {PERIODS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {PERIOD_LABEL[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage reserve />
                  </FormItem>
                )}
              />
            </div>

            {/* "Para quem" e "Valor alvo" lado a lado. Sem permissão de atribuir,
                a meta é sempre da clínica e o valor ocupa a linha inteira. */}
            <div className={cn('grid gap-3', canAssign && 'grid-cols-2')}>
              {canAssign && (
                <FormField
                  control={form.control}
                  name="scopeType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Para quem é a meta? *</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          field.onChange(v)
                          // Usuário sozinho não tem meta compartilhada.
                          if (v === 'USER') form.setValue('mode', 'INDIVIDUAL')
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-background">
                          <SelectItem value="CLINIC">Clínica</SelectItem>
                          <SelectItem value="USER">Um usuário</SelectItem>
                          <SelectItem value="ROLE">Um cargo</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage reserve />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="targetValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor alvo *</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <MoneyInput
                          maxLength={20}
                          className={isPercent ? 'pr-8' : undefined}
                          {...field}
                        />
                      </FormControl>
                      {isPercent && (
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      )}
                    </div>
                    {/* Slot ÚNICO: o erro tem prioridade sobre a dica, e a linha
                        existe mesmo vazia (altura do diálogo constante). */}
                    {form.formState.errors.targetValue ? (
                      <FormMessage />
                    ) : (
                      <p
                        className={cn(
                          FIELD_ERROR_SLOT,
                          'truncate text-xs leading-4 text-muted-foreground'
                        )}
                      >
                        {isPercent ? 'Ex.: 60 para 60%.' : ''}
                      </p>
                    )}
                  </FormItem>
                )}
              />
            </div>

            {canAssign && scopeType === 'USER' && (
              <FormField
                control={form.control}
                name="assigneeUserId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuário *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-background">
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage reserve />
                  </FormItem>
                )}
              />
            )}

            {canAssign && scopeType === 'ROLE' && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="assigneeRoleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-background">
                          {roles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage reserve />
                    </FormItem>
                  )}
                />
                {/* Só cargo (grupo) escolhe modo. Clínica é sempre coletiva;
                    usuário sozinho é sempre individual. */}
                <FormField
                  control={form.control}
                  name="mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modo *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-background">
                          <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                          <SelectItem value="SHARED">Compartilhada</SelectItem>
                        </SelectContent>
                      </Select>
                      {/* A dica ocupa o mesmo slot do erro — sem linha extra. */}
                      <p
                        className={cn(
                          FIELD_ERROR_SLOT,
                          'truncate text-xs leading-4 text-muted-foreground'
                        )}
                      >
                        {mode === 'INDIVIDUAL' ? 'Cota por pessoa.' : 'Soma do grupo.'}
                      </p>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Início *</FormLabel>
                    <FormControl>
                      <DateInput {...field} />
                    </FormControl>
                    <FormMessage reserve />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fim *</FormLabel>
                    <FormControl>
                      <DateInput {...field} />
                    </FormControl>
                    <FormMessage reserve />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Salvar' : 'Criar meta'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
