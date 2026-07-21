'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'
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
import { DateTimeInput } from '@/components/ui/date-time-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toSPWallClock } from '@/lib/calendar-time'
import { getScheduleViolation } from '@/lib/schedule-violation'
import { DEFAULT_SCHEDULE, type ClinicSchedule } from '@/modules/appointments/types'
import { getAppointmentAction } from '@/server/actions/appointment-actions'
import { regressRescheduleLeadAction } from '@/server/actions/lead-actions'

import type { ProcedureOption } from './schedule-lead-dialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  leadId: string | null
  appointmentId: string | null
  leadName: string
  stageId: string
  position?: number
  procedures: ProcedureOption[]
  schedule?: ClinicSchedule
  /** Confirmado → o board persiste o retrocesso. */
  onDone: () => void
  /** Cancelado/erro → o board reverte o card para a etapa de origem. */
  onCancel: () => void
}

/**
 * Dialog de RETROCESSO para Agendado com remarcação. Mostra os dados do
 * agendamento já preenchidos: submeter sem mexer mantém o mesmo horário; alterar
 * a data REAGENDA o MESMO Appointment (não cria outro — sem duplicar na agenda).
 * Comparecimento/baixa financeira são desfeitos, conforme o caso.
 */
export function RescheduleLeadDialog({
  open,
  onOpenChange,
  clientId,
  leadId,
  appointmentId,
  leadName,
  stageId,
  position,
  procedures,
  schedule = DEFAULT_SCHEDULE,
  onDone,
  onCancel,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [procedureId, setProcedureId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState(60)
  const [notes, setNotes] = useState('')
  // dateBlurred só vira true depois que o usuário MEXE na data — assim a data
  // pré-preenchida (possivelmente no passado, pois já foi atendida) não bloqueia
  // o "submeter sem alterar".
  const [dateBlurred, setDateBlurred] = useState(false)
  const [pastDateAck, setPastDateAck] = useState(false)
  const [scheduleAck, setScheduleAck] = useState(false)
  const [farFutureAck, setFarFutureAck] = useState(false)
  const [pending, startTransition] = useTransition()

  // Carrega os dados do agendamento atual para pré-preencher.
  useEffect(() => {
    if (!open || !appointmentId) return
    setLoading(true)
    setDateBlurred(false)
    setPastDateAck(false)
    setScheduleAck(false)
    setFarFutureAck(false)
    getAppointmentAction(appointmentId, clientId).then((res) => {
      setLoading(false)
      if (!res.success) {
        toast.error(res.error.message)
        onOpenChange(false)
        onCancel()
        return
      }
      const a = res.data
      setProcedureId(a.procedureId)
      setScheduledAt(toSPWallClock(new Date(a.scheduledAt)).slice(0, 16))
      setDuration(a.durationMinutes)
      setNotes(a.notes ?? '')
    })
  }, [open, appointmentId, clientId, onOpenChange, onCancel])

  const minScheduledDate = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    return d
  })()
  const pad = (n: number) => String(n).padStart(2, '0')
  const minScheduledAttr = `${minScheduledDate.getFullYear()}-${pad(minScheduledDate.getMonth() + 1)}-${pad(minScheduledDate.getDate())}T${pad(minScheduledDate.getHours())}:${pad(minScheduledDate.getMinutes())}`

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null
  const isPastDate = scheduledDate != null && scheduledDate.getTime() < Date.now()
  const isTooOld = scheduledDate != null && scheduledDate.getTime() < minScheduledDate.getTime()
  const showPastWarning = dateBlurred && isPastDate && !isTooOld
  const blockedByPastWarning = showPastWarning && !pastDateAck

  const scheduleViolation = dateBlurred ? getScheduleViolation(scheduledAt, schedule) : null
  const blockedBySchedule = scheduleViolation !== null && !scheduleAck

  const farFutureThreshold = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 4)
    return d
  })()
  const isFarFuture = dateBlurred && scheduledDate != null && scheduledDate > farFutureThreshold
  const blockedByFarFuture = isFarFuture && !farFutureAck

  function pickProcedure(id: string) {
    setProcedureId(id)
    const proc = procedures.find((p) => p.id === id)
    if (proc?.durationMinutes) setDuration(proc.durationMinutes)
  }

  function cancel() {
    onOpenChange(false)
    onCancel()
  }

  function confirm() {
    if (!leadId || !appointmentId) return
    if (!procedureId) {
      toast.error('Selecione um procedimento')
      return
    }
    if (!scheduledAt) {
      toast.error('Informe a data e hora')
      return
    }
    if (isTooOld) {
      toast.error('Não é possível agendar mais de 1 ano no passado')
      return
    }
    if (blockedByPastWarning || blockedBySchedule || blockedByFarFuture) {
      toast.error('Confirme os avisos sobre a data')
      return
    }
    startTransition(async () => {
      const res = await regressRescheduleLeadAction(leadId, clientId, {
        stageId,
        appointmentId,
        procedureId,
        scheduledAt,
        durationMinutes: duration,
        notes: notes || undefined,
        position,
      })
      if (!res.success) {
        toast.error(res.error.message)
        onOpenChange(false)
        onCancel()
        return
      }
      toast.success('Card retrocedido — agendamento remarcado')
      onOpenChange(false)
      onDone()
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
      <DialogContent className="sm:max-w-md" aria-describedby="reschedule-lead-desc">
        <DialogHeader>
          <DialogTitle>Retroceder para Agendado — {leadName}</DialogTitle>
          <DialogDescription id="reschedule-lead-desc">
            Revise os dados do agendamento. Sem alterar nada, é o mesmo horário; mudando a data, o
            MESMO agendamento é remarcado (não cria outro).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Isto retrocede o card para Agendado e desfaz o comparecimento e a baixa financeira (se
            houver).
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="reschedule-procedure">Procedimento *</Label>
              <Select value={procedureId} onValueChange={pickProcedure}>
                <SelectTrigger id="reschedule-procedure">
                  <SelectValue placeholder="Selecionar procedimento..." />
                </SelectTrigger>
                <SelectContent>
                  {procedures.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.durationMinutes ? ` · ${p.durationMinutes}min` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data/hora ocupa 2 de 3 colunas — ver create-appointment-dialog. */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="reschedule-when">Data e hora *</Label>
                <DateTimeInput
                  id="reschedule-when"
                  min={minScheduledAttr}
                  value={scheduledAt}
                  onChange={(e) => {
                    setScheduledAt(e.target.value)
                    setDateBlurred(true)
                    setPastDateAck(false)
                    setScheduleAck(false)
                    setFarFutureAck(false)
                  }}
                  onBlur={() => setDateBlurred(true)}
                  invalid={isTooOld}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reschedule-duration">Duração (min)</Label>
                <Input
                  id="reschedule-duration"
                  type="number"
                  min={5}
                  max={480}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
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
                htmlFor="reschedule-past-ack"
                className="flex cursor-pointer items-start gap-2 rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/50 dark:text-red-200"
              >
                <input
                  id="reschedule-past-ack"
                  type="checkbox"
                  checked={pastDateAck}
                  onChange={(e) => setPastDateAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-red-600"
                />
                <span>Esta data e hora já se passaram. Confirmo mesmo assim.</span>
              </label>
            )}

            {scheduleViolation && (
              <label
                htmlFor="reschedule-schedule-ack"
                className="flex cursor-pointer items-start gap-2 rounded-md border border-orange-400 bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-200"
              >
                <input
                  id="reschedule-schedule-ack"
                  type="checkbox"
                  checked={scheduleAck}
                  onChange={(e) => setScheduleAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-orange-600"
                />
                <span>
                  <strong>Fora do expediente:</strong> {scheduleViolation} Confirmo mesmo assim.
                </span>
              </label>
            )}

            {isFarFuture && (
              <label
                htmlFor="reschedule-future-ack"
                className="flex cursor-pointer items-start gap-2 rounded-md border border-blue-400 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200"
              >
                <input
                  id="reschedule-future-ack"
                  type="checkbox"
                  checked={farFutureAck}
                  onChange={(e) => setFarFutureAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
                />
                <span>Data com mais de 4 meses de antecedência. Confirmo mesmo assim.</span>
              </label>
            )}

            <div className="space-y-1">
              <Label htmlFor="reschedule-notes">Observações</Label>
              <textarea
                id="reschedule-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Observações opcionais..."
              />
            </div>
          </div>
        )}

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
              !procedureId ||
              !scheduledAt ||
              isTooOld ||
              blockedByPastWarning ||
              blockedBySchedule ||
              blockedByFarFuture
            }
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar retrocesso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
