'use client'

import { useState, useTransition } from 'react'
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
import { createRevenueAction } from '@/server/actions/revenue-actions'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from './types'
import type { ProcedureForSelect } from './types'

type Patient = { id: string; name: string }

type Props = {
  open: boolean
  clientId: string
  patients: Patient[]
  procedures: ProcedureForSelect[]
  onOpenChange: (v: boolean) => void
  onCreated: () => void
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
  onOpenChange,
  onCreated,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState(EMPTY)

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

    startTransition(async () => {
      const result = await createRevenueAction(clientId, {
        amount,
        date: form.date,
        description: form.description || undefined,
        paymentMethod: form.paymentMethod || undefined,
        installments: form.installments ? parseInt(form.installments) : undefined,
        patientId: form.patientId || undefined,
        procedureId: form.procedureId || undefined,
      })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Receita registrada!')
      reset()
      onOpenChange(false)
      onCreated()
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
          <DialogTitle>Nova Receita</DialogTitle>
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
                  setForm((f) => ({ ...f, patientId: v === '__none__' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
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
                  setForm((f) => ({ ...f, procedureId: v === '__none__' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
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
                  setForm((f) => ({ ...f, paymentMethod: v === '__none__' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Não informar</SelectItem>
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
                onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))}
              />
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
