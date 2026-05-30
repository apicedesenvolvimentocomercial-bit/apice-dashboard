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
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { createPatientAction } from '@/server/actions/patient-actions'

type Props = {
  open: boolean
  clientId: string
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

type FormErrors = Partial<Record<'name' | 'phone' | 'email' | 'birthDate' | 'cpf', string>>

function validate(form: {
  name: string
  phone: string
  email: string
  birthDate: string
  cpf: string
}): FormErrors {
  const errors: FormErrors = {}

  // feat1 — os 5 campos são obrigatórios no cadastro manual.
  if (!form.name.trim()) {
    errors.name = 'Nome é obrigatório'
  } else if (form.name.trim().length < 2) {
    errors.name = 'Nome deve ter ao menos 2 caracteres'
  }

  if (!form.phone.trim()) {
    errors.phone = 'Telefone é obrigatório'
  } else {
    const digits = form.phone.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 11) {
      errors.phone = 'Telefone deve ter 10 ou 11 dígitos'
    }
  }

  if (!form.email.trim()) {
    errors.email = 'E-mail é obrigatório'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'E-mail inválido'
  }

  if (!form.birthDate) {
    errors.birthDate = 'Data de nascimento é obrigatória'
  } else {
    const date = new Date(form.birthDate)
    if (isNaN(date.getTime())) {
      errors.birthDate = 'Data inválida'
    } else if (date > new Date()) {
      errors.birthDate = 'Data não pode ser no futuro'
    } else if (date.getFullYear() < 1900) {
      errors.birthDate = 'Data muito antiga'
    }
  }

  if (!form.cpf.trim()) {
    errors.cpf = 'CPF é obrigatório'
  } else {
    const digits = form.cpf.replace(/\D/g, '')
    if (digits.length !== 11) {
      errors.cpf = 'CPF deve ter 11 dígitos'
    }
  }

  return errors
}

const EMPTY = { name: '', phone: '', email: '', birthDate: '', cpf: '', notes: '' }

export function CreatePatientDialog({ open, clientId, onOpenChange, onCreated }: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof typeof EMPTY, boolean>>>({})

  function reset() {
    setForm(EMPTY)
    setErrors({})
    setTouched({})
  }

  function handleBlur(field: keyof typeof EMPTY) {
    setTouched((t) => ({ ...t, [field]: true }))
    setErrors(validate(form))
  }

  function handleChange<K extends keyof typeof EMPTY>(field: K, value: string) {
    const next = { ...form, [field]: value }
    setForm(next)
    if (touched[field]) setErrors(validate(next))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const allTouched = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, true]))
    setTouched(allTouched)
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    startTransition(async () => {
      const result = await createPatientAction(clientId, form)
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Paciente cadastrado!')
      reset()
      onOpenChange(false)
      onCreated?.()
    })
  }

  function field(id: keyof typeof EMPTY) {
    return {
      'aria-invalid': !!errors[id as keyof FormErrors],
      className: cn(
        errors[id as keyof FormErrors] && 'border-destructive focus-visible:ring-destructive'
      ),
      onBlur: () => handleBlur(id),
    }
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
          <DialogTitle>Novo Paciente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1">
            <Label htmlFor="p-name">Nome *</Label>
            <Input
              id="p-name"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Nome completo"
              {...field('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="p-phone">Telefone *</Label>
              <Input
                id="p-phone"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="(00) 00000-0000"
                {...field('phone')}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-birth">Data de nascimento *</Label>
              <DateInput
                id="p-birth"
                value={form.birthDate}
                onChange={(e) => handleChange('birthDate', e.target.value)}
                {...field('birthDate')}
              />
              {errors.birthDate && <p className="text-xs text-destructive">{errors.birthDate}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="p-email">E-mail *</Label>
            <Input
              id="p-email"
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="paciente@email.com"
              {...field('email')}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="p-cpf">CPF *</Label>
            <Input
              id="p-cpf"
              value={form.cpf}
              onChange={(e) => handleChange('cpf', e.target.value)}
              placeholder="000.000.000-00"
              {...field('cpf')}
            />
            {errors.cpf && <p className="text-xs text-destructive">{errors.cpf}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="p-notes">Observações</Label>
            <textarea
              id="p-notes"
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Anotações sobre o paciente..."
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
