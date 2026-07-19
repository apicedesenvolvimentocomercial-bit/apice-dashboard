'use client'

import { HelpCircle } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { IntegerInput } from '@/components/ui/integer-input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { MAX_MONEY, SAFE_TEXT_REGEX, formatMoneyBR, parseMoneyBR } from '@/lib/masks'
import { createProcedureAction, updateProcedureAction } from '@/server/actions/procedure-actions'
import type { ProcedureWithStats } from './types'

type Props = {
  open: boolean
  clientId: string
  procedure?: ProcedureWithStats
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

// Espelham `procedureSchema` de `server/actions/procedure-actions`. O servidor
// continua sendo a autoridade; isto é só o feedback local (e o teto de dígitos
// que a máscara aplica na digitação).
const MAX_NAME = 255
const MAX_DESCRIPTION = 65535
const MAX_DURATION_MINUTES = 360
const MAX_RECURRENCE_DAYS = 365
/** 360 e 365 cabem em 3 dígitos — a máscara nem deixa digitar o 4º. */
const INT_DIGITS = 3

const EMPTY = {
  name: '',
  price: '',
  cost: '',
  durationMinutes: '',
  recurrenceDays: '',
  description: '',
}

type Values = typeof EMPTY
type Field = keyof Values
type Errors = Partial<Record<Field, string>>

/** Preço e custo têm as mesmas regras no zod (`nonnegative` + teto). */
function validateMoney(display: string, label: string): string | undefined {
  const value = parseMoneyBR(display)
  if (value === undefined) return `${label} obrigatório`
  if (value > MAX_MONEY) return `${label} muito alto`
  return undefined
}

/**
 * Campo inteiro OPCIONAL: vazio é válido (o zod marca `.optional()`). A máscara
 * já garante `.int()` e o sinal, então só restam os limites da faixa.
 */
function validateInteger(
  display: string,
  max: number,
  tooLow: string,
  tooHigh: string
): string | undefined {
  if (!display) return undefined
  const value = Number(display)
  if (value < 1) return tooLow
  if (value > max) return tooHigh
  return undefined
}

/**
 * Mensagens curtas de propósito: a linha de erro é ÚNICA e truncada, e estes
 * campos vivem em grid de 2 colunas dentro de um diálogo estreito.
 */
function validate(f: Values): Errors {
  const errors: Errors = {}

  const name = f.name.trim()
  if (!name) errors.name = 'Nome obrigatório'
  else if (name.length < 2) errors.name = 'Mínimo 2 caracteres'
  else if (name.length > MAX_NAME) errors.name = 'Nome muito grande'
  else if (!SAFE_TEXT_REGEX.test(name)) errors.name = 'Caracteres inválidos'

  const price = validateMoney(f.price, 'Preço')
  if (price) errors.price = price
  const cost = validateMoney(f.cost, 'Custo')
  if (cost) errors.cost = cost

  const duration = validateInteger(
    f.durationMinutes,
    MAX_DURATION_MINUTES,
    'Mínimo 1 minuto',
    `Máximo ${MAX_DURATION_MINUTES} minutos`
  )
  if (duration) errors.durationMinutes = duration

  const recurrence = validateInteger(
    f.recurrenceDays,
    MAX_RECURRENCE_DAYS,
    'Mínimo 1 dia',
    `Máximo ${MAX_RECURRENCE_DAYS} dias`
  )
  if (recurrence) errors.recurrenceDays = recurrence

  const description = f.description.trim()
  if (description.length > MAX_DESCRIPTION) errors.description = 'Descrição muito grande'
  else if (description && !SAFE_TEXT_REGEX.test(description))
    errors.description = 'Caracteres inválidos'

  return errors
}

export function CreateProcedureDialog({ open, clientId, procedure, onOpenChange, onSaved }: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<Values>(EMPTY)
  // Erro inline só aparece depois que o usuário sai do campo (ou tenta salvar),
  // senão acusaria "Nome obrigatório" na primeira letra.
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(
        procedure
          ? {
              name: procedure.name,
              // `formatMoneyBR`, não `String()`: a máscara descarta o ponto, e
              // um preço de 150.5 reabriria no campo como "1505".
              price: formatMoneyBR(procedure.price),
              cost: formatMoneyBR(procedure.cost),
              durationMinutes: procedure.durationMinutes ? String(procedure.durationMinutes) : '',
              recurrenceDays: procedure.recurrenceDays ? String(procedure.recurrenceDays) : '',
              description: procedure.description ?? '',
            }
          : EMPTY
      )
      setTouched({})
      setSubmitAttempted(false)
    }
  }, [open, procedure])

  const errors = validate(form)
  /** Só revela o erro depois do blur do campo (ou de uma tentativa de salvar). */
  const errorOf = (field: Field) => (touched[field] || submitAttempted ? errors[field] : undefined)
  /** Campo vazio não é cobrado ao sair; obrigatoriedade fica para o submit. */
  const touchIfFilled = (field: Field, value: string) => {
    if (value.trim()) setTouched((t) => ({ ...t, [field]: true }))
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setForm(EMPTY)
      setTouched({})
      setSubmitAttempted(false)
    }
    onOpenChange(v)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitAttempted(true)
    if (Object.keys(errors).length > 0) return

    const price = parseMoneyBR(form.price)
    const cost = parseMoneyBR(form.cost)
    if (price === undefined || cost === undefined) return // já coberto por `errors`

    const data = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price,
      cost,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
      // null (e não undefined) limpa a recorrência: procedimento único.
      recurrenceDays: form.recurrenceDays ? Number(form.recurrenceDays) : null,
    }

    startTransition(async () => {
      const result = procedure
        ? await updateProcedureAction(procedure.id, clientId, data)
        : await createProcedureAction(clientId, data)

      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success(procedure ? 'Procedimento atualizado!' : 'Procedimento criado!')
      onOpenChange(false)
      onSaved()
    })
  }

  function f(field: Field) {
    return {
      value: form[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [field]: e.target.value })),
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => touchIfFilled(field, e.target.value),
      'aria-invalid': !!errorOf(field),
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{procedure ? 'Editar Procedimento' : 'Novo Procedimento'}</DialogTitle>
        </DialogHeader>
        {/* Cada campo tem a linha de erro RESERVADA (`reserve`): o erro aparece
            e some sem empurrar o resto do diálogo. Com os slots reservados o
            ritmo de 16px somava demais — daí `space-y-3`. */}
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div className="space-y-2">
            <Label htmlFor="pr-name">Nome *</Label>
            <Input
              id="pr-name"
              placeholder="Nome do procedimento"
              maxLength={MAX_NAME}
              {...f('name')}
            />
            <FieldError message={errorOf('name')} reserve />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pr-price">Preço (R$) *</Label>
              <MoneyInput id="pr-price" {...f('price')} />
              <FieldError message={errorOf('price')} reserve />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-cost">Custo (R$) *</Label>
              <MoneyInput id="pr-cost" {...f('cost')} />
              <FieldError message={errorOf('cost')} reserve />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              {/* Altura travada no tamanho do rótulo (14px): a coluna vizinha
                  ganha um ícone e sem isto as duas linhas desalinhariam. */}
              <div className="flex h-3.5 items-center">
                <Label htmlFor="pr-duration">Duração (minutos)</Label>
              </div>
              <IntegerInput
                id="pr-duration"
                placeholder="60"
                maxDigits={INT_DIGITS}
                {...f('durationMinutes')}
              />
              <FieldError message={errorOf('durationMinutes')} reserve />
            </div>
            <div className="space-y-2">
              <div className="flex h-3.5 items-center gap-1">
                <Label htmlFor="pr-recurrence">Recorrência (dias)</Label>
                <RecurrenceHelp />
              </div>
              <IntegerInput
                id="pr-recurrence"
                placeholder="ex: 90"
                maxDigits={INT_DIGITS}
                {...f('recurrenceDays')}
              />
              <FieldError message={errorOf('recurrenceDays')} reserve />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pr-desc">Descrição</Label>
            <Input
              id="pr-desc"
              placeholder="Descrição opcional..."
              maxLength={MAX_DESCRIPTION}
              {...f('description')}
            />
            <FieldError message={errorOf('description')} reserve />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A explicação da recorrência é longa demais para ficar solta no formulário —
 * empurrava os campos e competia com as linhas de erro. Fica atrás do "?".
 */
function RecurrenceHelp() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="O que é recorrência?"
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">
          Janela recomendada de retorno (fim do efeito). Passado esse prazo sem nova visita, o
          paciente vai para &quot;Reativação&quot; no funil de retenção. Deixe vazio se o
          procedimento é único, sem retorno esperado.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
