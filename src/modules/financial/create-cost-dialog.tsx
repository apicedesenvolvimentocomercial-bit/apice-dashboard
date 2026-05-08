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
import { createCostAction } from '@/server/actions/cost-actions'
import { COST_TYPE_LABELS } from './types'

const COST_TYPES = Object.keys(COST_TYPE_LABELS)

type Props = {
  open: boolean
  clientId: string
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}

const EMPTY = {
  type: 'FIXED',
  category: '',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  description: '',
  isRecurring: false,
  recurringDay: '',
}

export function CreateCostDialog({ open, clientId, onOpenChange, onCreated }: Props) {
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
      const result = await createCostAction(clientId, {
        type: form.type as 'FIXED' | 'VARIABLE' | 'MARKETING' | 'PAYROLL' | 'TAX' | 'OTHER',
        category: form.category || undefined,
        amount,
        date: form.date,
        description: form.description || undefined,
        isRecurring: form.isRecurring,
        recurringDay: form.recurringDay ? parseInt(form.recurringDay) : undefined,
      })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Custo registrado!')
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
          <DialogTitle>Novo Custo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COST_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {COST_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cs-category">Categoria</Label>
              <Input
                id="cs-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="ex: Aluguel, Marketing..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cs-amount">Valor (R$) *</Label>
              <Input
                id="cs-amount"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cs-date">Data *</Label>
              <Input
                id="cs-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cs-desc">Descrição</Label>
            <Input
              id="cs-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descrição opcional..."
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="cs-recurring"
              type="checkbox"
              checked={form.isRecurring}
              onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="cs-recurring" className="cursor-pointer font-normal">
              Custo recorrente mensal
            </Label>
            {form.isRecurring && (
              <Input
                type="number"
                min={1}
                max={31}
                value={form.recurringDay}
                onChange={(e) => setForm((f) => ({ ...f, recurringDay: e.target.value }))}
                placeholder="Dia"
                className="w-20"
              />
            )}
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
