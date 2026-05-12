'use client'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createRevenueAction, updateRevenueAction } from '@/server/actions/revenue-actions'
import { NONE_VALUE, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from './types'
import type { ProcedureForSelect, RevenueRow } from './types'

type Patient = { id: string; name: string }

type Props = {
  open: boolean
  clientId: string
  patients: Patient[]
  procedures: ProcedureForSelect[]
  revenue?: RevenueRow
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

const EMPTY = {
  amount: '',
  date: new Date().toISOString().split('T')[0],
  description: '',
  paymentMethod: '',
  installments: '1',
  patientId: '',
  procedureId: '',
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

  useEffect(() => {
    if (open) {
      setForm(
        revenue
          ? {
              amount: String(revenue.amount),
              date: new Date(revenue.date).toISOString().split('T')[0],
              description: revenue.description ?? '',
              paymentMethod: revenue.paymentMethod ?? '',
              installments: String(revenue.installments ?? 1),
              patientId: revenue.patient?.id ?? '',
              procedureId: revenue.procedure?.id ?? '',
            }
          : EMPTY
      )
    }
  }, [open, revenue])

  function reset() {
    setForm(EMPTY)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (!amount || amount <= 0) {
      toast.error('Informe um valor válido')
      return
    }

    let installments: number | undefined
    if (form.installments) {
      const n = parseInt(form.installments, 10)
      if (!Number.isFinite(n) || n < 1 || n > 36) {
        toast.error('Parcelas deve ser entre 1 e 36')
        return
      }
      installments = n
    }
    // Parcelamento só faz sentido em cartão de crédito.
    if (installments && installments > 1 && form.paymentMethod !== 'CREDIT_CARD') {
      toast.error('Parcelamento só é permitido com cartão de crédito')
      return
    }

    const data = {
      amount,
      date: form.date,
      description: form.description || undefined,
      paymentMethod: form.paymentMethod || undefined,
      installments,
      patientId: form.patientId || undefined,
      procedureId: form.procedureId || undefined,
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
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{revenue ? 'Editar Receita' : 'Nova Receita'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="rv-amount">Valor (R$) *</Label>
              <Input
                id="rv-amount"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rv-date">Data *</Label>
              <Input
                id="rv-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Paciente</Label>
              <Select
                value={form.patientId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, patientId: v === NONE_VALUE ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Nenhum</SelectItem>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Procedimento</Label>
              <Select
                value={form.procedureId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, procedureId: v === NONE_VALUE ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Nenhum</SelectItem>
                  {procedures.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Forma de pagamento</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, paymentMethod: v === NONE_VALUE ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Não informar</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rv-installments">Parcelas</Label>
              <Input
                id="rv-installments"
                type="number"
                min={1}
                max={36}
                value={form.installments}
                disabled={form.paymentMethod !== 'CREDIT_CARD'}
                onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))}
              />
              {form.paymentMethod !== 'CREDIT_CARD' && (
                <p className="text-[10px] text-muted-foreground">
                  Disponível só para cartão de crédito
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="rv-desc">Descrição</Label>
            <Input
              id="rv-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descrição opcional..."
            />
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
