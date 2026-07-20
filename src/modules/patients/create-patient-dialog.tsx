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
import { CpfInput } from '@/components/ui/cpf-input'
import { PhoneInput } from '@/components/ui/phone-input'
import { DateInput } from '@/components/ui/date-input'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import { MAX_CARD_NOTES } from '@/lib/masks'
import { cn } from '@/lib/utils'
import { createPatientAction } from '@/server/actions/patient-actions'

import {
  EMPTY_PATIENT_FORM,
  validatePatientForm,
  type PatientFormErrors,
  type PatientFormField,
  type PatientFormValues,
} from './patient-form'

type Props = {
  open: boolean
  clientId: string
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function CreatePatientDialog({ open, clientId, onOpenChange, onCreated }: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<PatientFormValues>(EMPTY_PATIENT_FORM)
  const [errors, setErrors] = useState<PatientFormErrors>({})
  // Erros só aparecem DEPOIS de tentar salvar — nunca ao abrir o popup nem ao
  // sair de um campo (o autofocus do dialog dispararia o blur do Nome). Depois
  // do 1º submit, revalidamos a cada digitação para o erro sumir conforme corrige.
  const [submitted, setSubmitted] = useState(false)

  function reset() {
    setForm(EMPTY_PATIENT_FORM)
    setErrors({})
    setSubmitted(false)
  }

  function handleChange<K extends keyof PatientFormValues>(field: K, value: string) {
    const next = { ...form, [field]: value }
    setForm(next)
    if (submitted) {
      setErrors(validatePatientForm(next))
      return
    }
    // Campo que já mostra erro (aceso no blur) reavalia ao vivo, p/ sumir ao corrigir.
    const key = field as PatientFormField
    if (errors[key]) {
      const all = validatePatientForm(next)
      setErrors((prev) => ({ ...prev, [key]: all[key] }))
    }
  }

  // Igual ao popup de novo lead (`blurIfFilled`): valida ao SAIR do campo só se ele
  // tem conteúdo (ou já houve submit). E-mail sem `@dominio.tld` acusa aqui, na hora.
  // Sair de um campo vazio — inclusive o autofocado — não cobra "obrigatório" (isso
  // fica pro submit), então não reintroduz o erro de acender tudo ao abrir.
  function handleBlur(name: PatientFormField) {
    if (!form[name].trim() && !submitted) return
    const all = validatePatientForm(form)
    setErrors((prev) => ({ ...prev, [name]: all[name] }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const errs = validatePatientForm(form)
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

  function field(id: PatientFormField) {
    return {
      'aria-invalid': !!errors[id],
      className: cn(errors[id] && 'border-destructive focus-visible:ring-destructive'),
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
              maxLength={255}
              {...field('name')}
            />
            <FieldError message={errors.name} reserve />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="p-phone">Telefone *</Label>
              <PhoneInput
                id="p-phone"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                {...field('phone')}
              />
              <FieldError message={errors.phone} reserve />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-birth">Data de nascimento *</Label>
              <DateInput
                id="p-birth"
                value={form.birthDate}
                onChange={(e) => handleChange('birthDate', e.target.value)}
                {...field('birthDate')}
              />
              <FieldError message={errors.birthDate} reserve />
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
              maxLength={255}
              {...field('email')}
            />
            <FieldError message={errors.email} reserve />
          </div>

          <div className="space-y-1">
            <Label htmlFor="p-cpf">CPF *</Label>
            <CpfInput
              id="p-cpf"
              value={form.cpf}
              onChange={(e) => handleChange('cpf', e.target.value)}
              {...field('cpf')}
            />
            <FieldError message={errors.cpf} reserve />
          </div>

          <div className="space-y-1">
            <Label htmlFor="p-notes">Observações</Label>
            <textarea
              id="p-notes"
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
              maxLength={MAX_CARD_NOTES}
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
