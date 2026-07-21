'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { attendAppointmentAction } from '@/server/actions/appointment-actions'
import { getPatientAction } from '@/server/actions/patient-actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  appointmentId: string | null
  patientId: string | null
  /** Pré-preenche os dados já conhecidos do agendamento. */
  defaults: { name: string; phone: string | null }
  /** Confirmado → o detalhe abre o prompt de receita. */
  onAttended: () => void
  /** Cancelado/fechado → apenas fecha o dialog. */
  onCancel: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')

// Data de nascimento é gravada como meia-noite UTC (ver createPatientAction).
// Lê de volta pelos componentes UTC para não deslocar o dia no fuso local.
function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * Compareceu pela AGENDA — dialog BLOQUEANTE que completa o cadastro do paciente
 * (nome, telefone, e-mail, nascimento e CPF, todos obrigatórios), igual ao fluxo
 * da pipeline. Pré-preenche com os dados atuais do paciente. Ao salvar, o paciente
 * vira "real", o agendamento é marcado ATTENDED e o card comercial ligado (se
 * houver) avança para Compareceu (`attendAppointmentAction`).
 */
export function AttendAppointmentDialog({
  open,
  onOpenChange,
  clientId,
  appointmentId,
  patientId,
  defaults,
  onAttended,
  onCancel,
}: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [cpf, setCpf] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()

  // Ao abrir, pré-preenche com os dados atuais do paciente (e-mail/nascimento/CPF
  // só existem se o paciente já for "real"; senão ficam vazios para completar).
  useEffect(() => {
    if (!open || !patientId) return
    let active = true
    setName(defaults.name ?? '')
    setPhone(defaults.phone ?? '')
    setEmail('')
    setBirthDate('')
    setCpf('')
    setLoading(true)
    getPatientAction(patientId, clientId)
      .then((res) => {
        if (!active) return
        if (res.success) {
          const p = res.data
          setName(p.name ?? defaults.name ?? '')
          setPhone(p.phone ?? defaults.phone ?? '')
          setEmail(p.email ?? '')
          setBirthDate(toDateInput(p.birthDate))
          setCpf(p.cpf ?? '')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, patientId, clientId, defaults])

  function cancel() {
    onOpenChange(false)
    onCancel()
  }

  function confirm() {
    if (!appointmentId) return
    if (!name.trim() || !phone.trim() || !email.trim() || !birthDate || !cpf.trim()) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    startTransition(async () => {
      const res = await attendAppointmentAction(appointmentId, clientId, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        birthDate,
        cpf: cpf.trim(),
      })
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success('Comparecimento registrado — cadastro completo')
      onOpenChange(false)
      onAttended()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) cancel()
        else onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md" aria-describedby="attend-appt-desc">
        <DialogHeader>
          <DialogTitle>Compareceu — completar cadastro</DialogTitle>
          <DialogDescription id="attend-appt-desc">
            Para registrar o comparecimento, complete o cadastro do paciente. Todos os campos são
            obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="attend-appt-name">Nome *</Label>
            <Input
              id="attend-appt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="attend-appt-phone">Telefone *</Label>
              <Input
                id="attend-appt-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="attend-appt-cpf">CPF *</Label>
              <Input
                id="attend-appt-cpf"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="attend-appt-email">E-mail *</Label>
              <Input
                id="attend-appt-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="exemplo@mail.com"
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="attend-appt-birth">Nascimento *</Label>
              <DateInput
                id="attend-appt-birth"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={
              pending ||
              loading ||
              !name.trim() ||
              !phone.trim() ||
              !email.trim() ||
              !birthDate ||
              !cpf.trim()
            }
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar comparecimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
