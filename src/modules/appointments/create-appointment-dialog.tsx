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
import { getScheduleViolation } from '@/lib/schedule-violation'
import { createAppointmentAction } from '@/server/actions/appointment-actions'
import type { PatientWithStats } from '@/server/repositories/patient-repository'
import type { ProcedureForSelect } from '@/server/repositories/procedure-repository'
import { DEFAULT_SCHEDULE } from './types'
import type { ClinicSchedule } from './types'

type Props = {
  open: boolean
  clientId: string
  patients: PatientWithStats[]
  procedures: ProcedureForSelect[]
  defaultDate?: string
  schedule?: ClinicSchedule
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function CreateAppointmentDialog({
  open,
  clientId,
  patients,
  procedures,
  defaultDate,
  schedule = DEFAULT_SCHEDULE,
  onOpenChange,
  onCreated,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    patientId: '',
    procedureId: '',
    scheduledAt: defaultDate ?? '',
    durationMinutes: 60,
    notes: '',
  })
  const [dateBlurred, setDateBlurred] = useState(false)
  const [pastDateAck, setPastDateAck] = useState(false)
  const [scheduleAck, setScheduleAck] = useState(false)
  const [farFutureAck, setFarFutureAck] = useState(false)

  // Limite duro: 1 ano atrás a partir de agora. Server também valida.
  const minScheduledDate = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    return d
  })()
  // Formato aceito pelo input datetime-local: "YYYY-MM-DDTHH:mm" no fuso local.
  const pad = (n: number) => String(n).padStart(2, '0')
  const minScheduledAttr = `${minScheduledDate.getFullYear()}-${pad(minScheduledDate.getMonth() + 1)}-${pad(minScheduledDate.getDate())}T${pad(minScheduledDate.getHours())}:${pad(minScheduledDate.getMinutes())}`
  const scheduledDate = form.scheduledAt ? new Date(form.scheduledAt) : null
  const isPastDate = scheduledDate != null && scheduledDate.getTime() < Date.now()
  const isTooOld = scheduledDate != null && scheduledDate.getTime() < minScheduledDate.getTime()
  // Só consideramos "no passado" depois que o usuário sair do input (blur),
  // para não acusar enquanto ainda está digitando "2026-...".
  const showPastWarning = dateBlurred && isPastDate && !isTooOld
  const blockedByPastWarning = showPastWarning && !pastDateAck

  const scheduleViolation = dateBlurred ? getScheduleViolation(form.scheduledAt, schedule) : null
  const blockedBySchedule = scheduleViolation !== null && !scheduleAck

  const farFutureThreshold = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 4)
    return d
  })()
  const isFarFuture = dateBlurred && scheduledDate != null && scheduledDate > farFutureThreshold
  const blockedByFarFuture = isFarFuture && !farFutureAck

  function handleProcedureChange(procedureId: string) {
    const proc = procedures.find((p) => p.id === procedureId)
    setForm((f) => ({
      ...f,
      procedureId,
      durationMinutes: proc?.durationMinutes ?? f.durationMinutes,
    }))
  }

  function reset() {
    setForm({
      patientId: '',
      procedureId: '',
      scheduledAt: defaultDate ?? '',
      durationMinutes: 60,
      notes: '',
    })
    setDateBlurred(false)
    setPastDateAck(false)
    setScheduleAck(false)
    setFarFutureAck(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.patientId || !form.procedureId || !form.scheduledAt) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    if (isTooOld) {
      toast.error('Não é possível agendar mais de 1 ano no passado')
      return
    }
    if (blockedByPastWarning) {
      toast.error('Confirme a ciência sobre a data no passado')
      return
    }
    if (blockedBySchedule) {
      toast.error('Confirme o agendamento fora do horário da clínica')
      return
    }
    if (blockedByFarFuture) {
      toast.error('Confirme o agendamento com mais de 4 meses de antecedência')
      return
    }
    startTransition(async () => {
      const result = await createAppointmentAction(clientId, {
        ...form,
        durationMinutes: Number(form.durationMinutes),
      })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Agendamento criado!')
      reset()
      onOpenChange(false)
      onCreated?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Novo Agendamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="apt-patient">Paciente *</Label>
            <Select
              value={form.patientId}
              onValueChange={(v) => setForm((f) => ({ ...f, patientId: v }))}
            >
              <SelectTrigger id="apt-patient">
                <SelectValue placeholder="Selecionar paciente..." />
              </SelectTrigger>
              <SelectContent>
                {patients.length === 0 ? (
                  <SelectItem value="_empty" disabled>
                    Nenhum paciente cadastrado
                  </SelectItem>
                ) : (
                  patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.phone ? ` · ${p.phone}` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="apt-procedure">Procedimento *</Label>
            <Select value={form.procedureId} onValueChange={handleProcedureChange}>
              <SelectTrigger id="apt-procedure">
                <SelectValue placeholder="Selecionar procedimento..." />
              </SelectTrigger>
              <SelectContent>
                {procedures.length === 0 ? (
                  <SelectItem value="_empty" disabled>
                    Nenhum procedimento cadastrado
                  </SelectItem>
                ) : (
                  procedures.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.durationMinutes ? ` · ${p.durationMinutes}min` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="apt-date">Data e hora *</Label>
              <Input
                id="apt-date"
                type="datetime-local"
                lang="pt-BR"
                min={minScheduledAttr}
                value={form.scheduledAt}
                onChange={(e) => {
                  setForm((f) => ({ ...f, scheduledAt: e.target.value }))
                  setPastDateAck(false)
                  setScheduleAck(false)
                  setFarFutureAck(false)
                }}
                onBlur={() => setDateBlurred(true)}
                aria-invalid={isTooOld || undefined}
                className={isTooOld ? 'border-red-500 focus-visible:ring-red-500' : undefined}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="apt-duration">Duração (min)</Label>
              <Input
                id="apt-duration"
                type="number"
                min={5}
                max={480}
                value={form.durationMinutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          {isTooOld && (
            <p className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/50 dark:text-red-200">
              Não é possível agendar mais de 1 ano no passado.
            </p>
          )}

          {showPastWarning && (
            <label
              htmlFor="apt-past-ack"
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                pastDateAck
                  ? 'border-emerald-300 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/50 dark:text-red-200'
              }`}
            >
              <input
                id="apt-past-ack"
                type="checkbox"
                checked={pastDateAck}
                onChange={(e) => setPastDateAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-red-600"
              />
              <span>
                Estou ciente que esta data e hora já se passaram e desejo registrar este agendamento
                mesmo assim.
              </span>
            </label>
          )}

          {scheduleViolation && (
            <label
              htmlFor="apt-schedule-ack"
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                scheduleAck
                  ? 'border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'border-orange-400 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-200'
              }`}
            >
              <input
                id="apt-schedule-ack"
                type="checkbox"
                checked={scheduleAck}
                onChange={(e) => setScheduleAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-orange-600"
              />
              <span>
                <strong>Fora do expediente:</strong> {scheduleViolation} Estou ciente e desejo
                agendar mesmo assim.
              </span>
            </label>
          )}

          {isFarFuture && (
            <label
              htmlFor="apt-future-ack"
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                farFutureAck
                  ? 'border-blue-300 bg-blue-50/60 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
                  : 'border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200'
              }`}
            >
              <input
                id="apt-future-ack"
                type="checkbox"
                checked={farFutureAck}
                onChange={(e) => setFarFutureAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
              />
              <span>
                <strong>Agendamento distante:</strong> A data selecionada está a mais de 4 meses no
                futuro. Estou ciente e desejo confirmar este agendamento.
              </span>
            </label>
          )}

          <div className="space-y-1">
            <Label htmlFor="apt-notes">Observações</Label>
            <textarea
              id="apt-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Observações opcionais..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                isPending ||
                !form.patientId ||
                !form.procedureId ||
                !form.scheduledAt ||
                isTooOld ||
                blockedByPastWarning ||
                blockedBySchedule ||
                blockedByFarFuture
              }
            >
              {isPending ? 'Salvando...' : 'Agendar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
