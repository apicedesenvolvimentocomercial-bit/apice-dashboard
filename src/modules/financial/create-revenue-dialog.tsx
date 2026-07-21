'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { X } from 'lucide-react'
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
import { MoneyInput } from '@/components/ui/money-input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { MAX_MONEY, SAFE_TEXT_REGEX, formatMoneyBR, parseMoneyBR } from '@/lib/masks'
import { createRevenueAction, updateRevenueAction } from '@/server/actions/revenue-actions'
import { formatCurrency, NONE_VALUE, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from './types'
import type { ProcedureForSelect, RevenueRow } from './types'

type Patient = { id: string; name: string; fromScheduledLead: boolean }

type Props = {
  open: boolean
  clientId: string
  patients: Patient[]
  procedures: ProcedureForSelect[]
  revenue?: RevenueRow
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

// Formas de pagamento que aceitam parcelamento. Só o cartão de crédito parcela;
// o input de parcelas mora DENTRO do select de forma de pagamento (rodapé) e só
// aparece quando uma dessas opções está selecionada.
const INSTALLABLE_METHODS = new Set(['CREDIT_CARD'])
// Espelha `installments` do `revenueSchema` da action (`.int().max(100).positive()`).
const MAX_INSTALLMENTS = 100
// Espelha `description` do `revenueSchema` (`.max(65535)`).
const MAX_DESCRIPTION = 65535

const EMPTY = {
  amount: '',
  date: new Date().toISOString().split('T')[0],
  description: '',
  paymentMethod: '',
  installments: '1',
  patientId: '',
  procedureIds: [] as string[],
  discountEnabled: false,
  discountPct: '',
  type: '', // '' = automático (procedimento se houver procedimento, senão outra)
}

const REVENUE_TYPE_LABELS: Record<string, string> = {
  PROCEDIMENTO: 'Procedimento',
  PACOTE: 'Pacote',
  RECORRENCIA: 'Recorrência/assinatura',
  PRODUTO: 'Produto',
  OUTRA: 'Outra',
  FINANCEIRA: 'Receita financeira',
}

export function CreateRevenueDialog({
  open,
  clientId,
  patients,
  procedures,
  revenue,
  onOpenChange,
  onSaved,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState(EMPTY)
  // Erro inline só aparece depois que o usuário sai do campo (ou tenta salvar).
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  // Remonta o Select de procedimentos após cada escolha p/ voltar ao placeholder.
  const [pickKey, setPickKey] = useState(0)

  const procById = useMemo(() => new Map(procedures.map((p) => [p.id, p])), [procedures])

  useEffect(() => {
    if (open) {
      setForm(
        revenue
          ? {
              amount: formatMoneyBR(revenue.amount),
              date: new Date(revenue.date).toISOString().split('T')[0],
              description: revenue.description ?? '',
              paymentMethod: revenue.paymentMethod ?? '',
              installments: String(revenue.installments ?? 1),
              patientId: revenue.patient?.id ?? '',
              procedureIds: revenue.procedures?.map((p) => p.procedureId) ?? [],
              discountEnabled: false,
              discountPct: '',
              type: '',
            }
          : EMPTY
      )
      setTouched({})
      setSubmitAttempted(false)
      setPickKey((k) => k + 1)
    }
  }, [open, revenue])

  function reset() {
    setForm(EMPTY)
    setTouched({})
    setSubmitAttempted(false)
  }

  function touch(field: string) {
    setTouched((t) => ({ ...t, [field]: true }))
  }
  function showErr(field: string) {
    return Boolean(touched[field] || submitAttempted)
  }

  const hasProcedures = form.procedureIds.length > 0
  const installable = INSTALLABLE_METHODS.has(form.paymentMethod)

  const proceduresSum = useMemo(
    () => form.procedureIds.reduce((s, id) => s + (procById.get(id)?.price ?? 0), 0),
    [form.procedureIds, procById]
  )
  const discountPctNum = form.discountEnabled ? parseFloat(form.discountPct.replace(',', '.')) : 0
  const validDiscount =
    Number.isFinite(discountPctNum) && discountPctNum >= 0 && discountPctNum <= 100
  const computedTotal = hasProcedures
    ? Math.round(proceduresSum * (1 - (validDiscount ? discountPctNum : 0) / 100) * 100) / 100
    : 0

  // ---- Validação (espelha o zod da action; server é a autoridade) ----
  const parsedAmount = parseMoneyBR(form.amount)
  const amountInvalid = hasProcedures
    ? undefined
    : parsedAmount === undefined
      ? 'Informe o valor'
      : parsedAmount <= 0
        ? 'Deve ser maior que zero'
        : parsedAmount > MAX_MONEY
          ? 'Valor muito alto'
          : undefined
  const amountError = showErr('amount') ? amountInvalid : undefined

  const dateInvalid = !form.date ? 'Data obrigatória' : undefined
  const dateError = showErr('date') ? dateInvalid : undefined

  const descInvalid =
    form.description.trim() && !SAFE_TEXT_REGEX.test(form.description)
      ? 'Caracteres inválidos'
      : undefined
  const descError = showErr('description') ? descInvalid : undefined

  const installmentsNum = parseInt(form.installments || '', 10)
  const installmentsInvalid = installable
    ? !Number.isFinite(installmentsNum) || installmentsNum < 1
      ? 'Mínimo 1 parcela'
      : installmentsNum > MAX_INSTALLMENTS
        ? `Máximo ${MAX_INSTALLMENTS} parcelas`
        : undefined
    : undefined

  // Desconto só existe com procedimento vinculado (incide sobre a soma). Se o
  // usuário habilitou e depois removeu os procedimentos, o bloco some e a regra
  // deixa de valer — por isso o `hasProcedures` no guard.
  const discountInvalid =
    hasProcedures && form.discountEnabled && form.discountPct.trim() && !validDiscount
      ? 'Entre 0 e 100%'
      : undefined
  const discountError = showErr('discount') ? discountInvalid : undefined

  function addProcedure(id: string) {
    if (!id || id === NONE_VALUE) return
    setForm((f) =>
      f.procedureIds.includes(id) ? f : { ...f, procedureIds: [...f.procedureIds, id] }
    )
    setPickKey((k) => k + 1)
  }

  function removeProcedure(index: number) {
    setForm((f) => ({ ...f, procedureIds: f.procedureIds.filter((_, i) => i !== index) }))
  }

  function setPaymentMethod(value: string) {
    const method = value === NONE_VALUE ? '' : value
    setForm((f) => ({
      ...f,
      paymentMethod: method,
      // Zera as parcelas ao sair de uma opção parcelável (só cartão parcela).
      installments: INSTALLABLE_METHODS.has(method) ? f.installments : '1',
    }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitAttempted(true)

    if (amountInvalid || dateInvalid || descInvalid || installmentsInvalid || discountInvalid) {
      toast.error('Verifique os campos destacados')
      return
    }

    // Valor: derivado da soma dos procedimentos, ou manual quando nenhum selecionado.
    const amount = hasProcedures ? computedTotal : (parsedAmount as number)
    if (!(amount > 0)) {
      toast.error('Informe um valor válido')
      return
    }

    // Parcelamento só faz sentido em opção parcelável (cartão de crédito).
    const installments = installable ? installmentsNum : 1

    const data = {
      amount,
      date: form.date,
      description: form.description.trim() || undefined,
      paymentMethod: form.paymentMethod || undefined,
      installments,
      patientId: form.patientId || undefined,
      procedureIds: form.procedureIds,
      discountPct:
        hasProcedures && form.discountEnabled && validDiscount ? discountPctNum : undefined,
      type: (form.type || undefined) as
        | 'PROCEDIMENTO'
        | 'PACOTE'
        | 'RECORRENCIA'
        | 'PRODUTO'
        | 'OUTRA'
        | 'FINANCEIRA'
        | undefined,
    }

    startTransition(async () => {
      const result = revenue
        ? await updateRevenueAction(revenue.id, clientId, data)
        : await createRevenueAction(clientId, data)

      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success(revenue ? 'Receita atualizada!' : 'Receita registrada!')
      reset()
      onOpenChange(false)
      onSaved()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      {/* max-h/scroll é rede de segurança; com os slots de erro reservados a
          altura é constante e a barra raramente aparece. */}
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-md"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{revenue ? 'Editar Receita' : 'Nova Receita'}</DialogTitle>
        </DialogHeader>
        {/* space-y-3 + slot de erro reservado sob CADA campo = ritmo homogêneo
            (mesmo padrão do popup de novo lead). */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Paciente / Lead */}
          <div className="space-y-2">
            <Label>Paciente / Lead</Label>
            <SearchableSelect
              portal={false}
              contentClassName="bg-background"
              value={form.patientId || NONE_VALUE}
              onChange={(v) => setForm((f) => ({ ...f, patientId: v === NONE_VALUE ? '' : v }))}
              placeholder="Selecionar..."
              searchPlaceholder="Buscar paciente ou lead..."
              emptyText="Nenhum paciente ou lead encontrado"
              options={[
                { value: NONE_VALUE, label: 'Nenhum' },
                ...patients.map((p) => ({
                  value: p.id,
                  label: p.name,
                  sublabel: p.fromScheduledLead ? 'Lead' : undefined,
                })),
              ]}
            />
            <FieldError reserve />
          </div>

          {/* Procedimentos (múltiplos) — busca igual ao popup de agendamento. */}
          <div className="space-y-2">
            <Label htmlFor="rv-procedure">Procedimentos</Label>
            <SearchableSelect
              key={pickKey}
              id="rv-procedure"
              portal={false}
              contentClassName="bg-background"
              value=""
              onChange={addProcedure}
              placeholder="Adicionar procedimento..."
              searchPlaceholder="Buscar procedimento..."
              emptyText={
                procedures.length === 0
                  ? 'Nenhum procedimento cadastrado'
                  : 'Nenhum procedimento encontrado'
              }
              options={procedures
                .filter((p) => !form.procedureIds.includes(p.id))
                .map((p) => ({
                  value: p.id,
                  label: p.name,
                  sublabel: formatCurrency(p.price),
                }))}
            />
            {form.procedureIds.length > 0 && (
              <ul className="mt-2 space-y-1">
                {form.procedureIds.map((id, i) => {
                  const proc = procById.get(id)
                  return (
                    <li
                      key={`${id}-${i}`}
                      className="flex items-center justify-between rounded-md border bg-muted/40 px-2 py-1 text-sm"
                    >
                      <span className="truncate">{proc?.name ?? 'Procedimento'}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {formatCurrency(proc?.price ?? 0)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeProcedure(i)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remover procedimento"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Desconto — COLADO ao bloco de procedimentos e só aparece quando há
                procedimento vinculado: o desconto incide sobre a soma dos preços,
                então sem procedimento não teria base (por isso ficava desabilitado
                antes; agora simplesmente não aparece). */}
            {hasProcedures ? (
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={form.discountEnabled}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        discountEnabled: e.target.checked,
                        discountPct: e.target.checked ? f.discountPct : '',
                      }))
                    }
                  />
                  <span>Desconto no valor total</span>
                </label>
                {form.discountEnabled ? (
                  <div className="space-y-2">
                    <Label htmlFor="rv-discount">Desconto (%)</Label>
                    <Input
                      id="rv-discount"
                      value={form.discountPct}
                      onChange={(e) => setForm((f) => ({ ...f, discountPct: e.target.value }))}
                      onBlur={() => touch('discount')}
                      placeholder="0"
                      inputMode="decimal"
                      maxLength={6}
                      aria-invalid={!!discountError}
                    />
                    {discountError ? (
                      <FieldError message={discountError} reserve />
                    ) : (
                      <p className="-mb-1 h-4 truncate text-xs leading-4 text-muted-foreground">
                        Soma {formatCurrency(proceduresSum)} → total {formatCurrency(computedTotal)}
                      </p>
                    )}
                  </div>
                ) : (
                  <FieldError reserve />
                )}
              </div>
            ) : (
              /* Slot só p/ ritmo — sem procedimento não há desconto. */
              <FieldError reserve />
            )}
          </div>

          {/* Tipo de receita (DRE) */}
          <div className="space-y-2">
            <Label>Tipo de receita</Label>
            <Select
              value={form.type || NONE_VALUE}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v === NONE_VALUE ? '' : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Automático" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value={NONE_VALUE}>Automático</SelectItem>
                {Object.entries(REVENUE_TYPE_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError reserve />
          </div>

          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rv-amount">Valor (R$) *</Label>
              {hasProcedures ? (
                <Input
                  id="rv-amount"
                  value={formatCurrency(computedTotal)}
                  readOnly
                  tabIndex={-1}
                  className="text-muted-foreground"
                />
              ) : (
                <MoneyInput
                  id="rv-amount"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  onBlur={() => touch('amount')}
                  aria-invalid={!!amountError}
                />
              )}
              {hasProcedures ? (
                <p className="-mb-1 h-4 truncate text-xs leading-4 text-muted-foreground">
                  Soma dos procedimentos
                </p>
              ) : (
                <FieldError message={amountError} reserve />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rv-date">Data *</Label>
              <DateInput
                id="rv-date"
                value={form.date}
                onChange={(e) => {
                  setForm((f) => ({ ...f, date: e.target.value }))
                  touch('date')
                }}
                onBlur={() => touch('date')}
                aria-invalid={!!dateError}
              />
              <FieldError message={dateError} reserve />
            </div>
          </div>

          {/* Forma de pagamento. O input de PARCELAS aparece COLADO logo abaixo,
              editável na hora, assim que uma opção parcelável (cartão) é escolhida
              — antes ficava no rodapé do dropdown, que o Radix fecha ao selecionar
              (o usuário tinha de reabrir p/ digitar). */}
          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select value={form.paymentMethod || NONE_VALUE} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                {form.paymentMethod ? (
                  <span className="flex items-center gap-1.5">
                    {PAYMENT_METHOD_LABELS[form.paymentMethod] ?? form.paymentMethod}
                    {installable && installmentsNum > 1 && (
                      <span className="text-muted-foreground">· {installmentsNum}x</span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Selecionar...</span>
                )}
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value={NONE_VALUE}>Não informar</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                    {INSTALLABLE_METHODS.has(m) ? ' · parcelável' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {installable ? (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="rv-installments" className="whitespace-nowrap text-xs">
                    Parcelas
                  </Label>
                  <IntegerInput
                    id="rv-installments"
                    maxDigits={3}
                    value={form.installments}
                    placeholder="1"
                    className="h-8 w-20"
                    onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))}
                    onBlur={() => touch('installments')}
                    aria-invalid={!!(showErr('installments') && installmentsInvalid)}
                  />
                </div>
                <FieldError
                  message={showErr('installments') ? installmentsInvalid : undefined}
                  reserve
                />
              </div>
            ) : (
              <FieldError reserve />
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="rv-desc">Descrição</Label>
            <Input
              id="rv-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              onBlur={() => touch('description')}
              placeholder="Descrição opcional..."
              maxLength={MAX_DESCRIPTION}
              aria-invalid={!!descError}
            />
            <FieldError message={descError} reserve />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
            >
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
