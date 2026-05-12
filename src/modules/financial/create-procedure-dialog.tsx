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
import { createProcedureAction, updateProcedureAction } from '@/server/actions/procedure-actions'
import type { ProcedureWithStats } from './types'

type Props = {
  open: boolean
  clientId: string
  procedure?: ProcedureWithStats
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

const EMPTY = { name: '', price: '', cost: '', durationMinutes: '', description: '' }

export function CreateProcedureDialog({ open, clientId, procedure, onOpenChange, onSaved }: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState(EMPTY)

  useEffect(() => {
    if (open) {
      setForm(
        procedure
          ? {
              name: procedure.name,
              price: String(procedure.price),
              cost: String(procedure.cost),
              durationMinutes: procedure.durationMinutes ? String(procedure.durationMinutes) : '',
              description: procedure.description ?? '',
            }
          : EMPTY
      )
    }
  }, [open, procedure])

  function handleOpenChange(v: boolean) {
    if (!v) setForm(EMPTY)
    onOpenChange(v)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const price = parseFloat(form.price.replace(',', '.'))
    const cost = parseFloat(form.cost.replace(',', '.'))

    if (!form.name.trim()) {
      toast.error('Nome obrigatório')
      return
    }
    if (isNaN(price) || price < 0) {
      toast.error('Preço inválido')
      return
    }
    if (isNaN(cost) || cost < 0) {
      toast.error('Custo inválido')
      return
    }

    const data = {
      name: form.name.trim(),
      description: form.description || undefined,
      price,
      cost,
      durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes) : undefined,
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

  function f(field: keyof typeof EMPTY) {
    return {
      value: form[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [field]: e.target.value })),
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{procedure ? 'Editar Procedimento' : 'Novo Procedimento'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="pr-name">Nome *</Label>
            <Input id="pr-name" placeholder="Nome do procedimento" {...f('name')} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pr-price">Preço (R$) *</Label>
              <Input id="pr-price" placeholder="0,00" {...f('price')} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pr-cost">Custo (R$) *</Label>
              <Input id="pr-cost" placeholder="0,00" {...f('cost')} required />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pr-duration">Duração (minutos)</Label>
            <Input
              id="pr-duration"
              type="number"
              min={1}
              placeholder="60"
              {...f('durationMinutes')}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="pr-desc">Descrição</Label>
            <Input id="pr-desc" placeholder="Descrição opcional..." {...f('description')} />
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
