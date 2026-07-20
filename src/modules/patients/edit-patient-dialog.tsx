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
import { CpfInput } from '@/components/ui/cpf-input'
import { PhoneInput } from '@/components/ui/phone-input'
import { DateInput } from '@/components/ui/date-input'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import { MAX_CARD_NOTES } from '@/lib/masks'
import { cn } from '@/lib/utils'
import { updatePatientAction } from '@/server/actions/patient-actions'

import {
  EMPTY_PATIENT_FORM,
  validatePatientForm,
  type PatientFormErrors,
  type PatientFormField,
  type PatientFormValues,
} from './patient-form'

/** Paciente atual (subconjunto de campos editáveis) vindo do drawer. */
export type EditablePatient = {
  id: string
  name: string
  phone: string | null
  email: string | null
  birthDate: Date | string | null
  cpf: string | null
  notes: string | null
}

type Props = {
  open: boolean
  clientId: string
  patient: EditablePatient
  onOpenChange: (open: boolean) => void
  onUpdated?: () => void
}

/** `Date`/ISO → `yyyy-mm-dd` que o `DateInput` consome (usa a data UTC gravada,
 *  sem shift de fuso — o cadastro grava `new Date('yyyy-mm-dd')` = meia-noite UTC). */
function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function EditPatientDialog({ open, clientId, patient, onOpenChange, onUpdated }: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<PatientFormValues>(EMPTY_PATIENT_FORM)
  const [errors, setErrors] = useState<PatientFormErrors>({})
  // Mesma regra do cadastro: erro só após tentar salvar (nunca ao abrir).
  const [submitted, setSubmitted] = useState(false)

  const birthIso = toDateInput(patient.birthDate)

  // Semeia o form com os dados do paciente ao ABRIR (ou quando eles mudam após um
  // salvamento) e zera erros/submitted. As deps são primitivas: enquanto o usuário
  // edita, os props do paciente não mudam, então isto não sobrescreve o que ele digita.
  useEffect(() => {
    if (!open) return
    setForm({
      name: patient.name ?? '',
      phone: patient.phone ?? '',
      email: patient.email ?? '',
      birthDate: birthIso,
      cpf: patient.cpf ?? '',
      notes: patient.notes ?? '',
    })
    setErrors({})
    setSubmitted(false)
  }, [open, patient.name, patient.phone, patient.email, birthIso, patient.cpf, patient.notes])

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
      const result = await updatePatientAction(patient.id, clientId, form)
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Paciente atualizado!')
      onOpenChange(false)
      onUpdated?.()
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Editar Paciente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1">
            <Label htmlFor="ep-name">Nome *</Label>
            <Input
              id="ep-name"
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
              <Label htmlFor="ep-phone">Telefone *</Label>
              <PhoneInput
                id="ep-phone"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                {...field('phone')}
              />
              <FieldError message={errors.phone} reserve />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ep-birth">Data de nascimento *</Label>
              <DateInput
                id="ep-birth"
                value={form.birthDate}
                onChange={(e) => handleChange('birthDate', e.target.value)}
                {...field('birthDate')}
              />
              <FieldError message={errors.birthDate} reserve />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ep-email">E-mail *</Label>
            <Input
              id="ep-email"
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
            <Label htmlFor="ep-cpf">CPF *</Label>
            <CpfInput
              id="ep-cpf"
              value={form.cpf}
              onChange={(e) => handleChange('cpf', e.target.value)}
              {...field('cpf')}
            />
            <FieldError message={errors.cpf} reserve />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ep-notes">Observações</Label>
            <textarea
              id="ep-notes"
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
              maxLength={MAX_CARD_NOTES}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Anotações sobre o paciente..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
