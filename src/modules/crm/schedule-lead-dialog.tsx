'use client'

import { Loader2, X } from 'lucide-react'
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
import { getScheduleViolation } from '@/lib/schedule-violation'
import { DEFAULT_SCHEDULE, type ClinicSchedule } from '@/modules/appointments/types'
import { scheduleLeadAction } from '@/server/actions/lead-actions'

export type ProcedureOption = {
  id: string
  name: string
  durationMinutes: number
  price: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  leadId: string | null
  leadName: string
  stageId: string
  procedures: ProcedureOption[]
  /** Expediente da clínica — mesmas regras de aviso da agenda. */
  schedule?: ClinicSchedule
  /** Confirmado com sucesso → o board persiste o move. */
  onScheduled: () => void
  /** Cancelado/erro → o board reverte o card para a etapa de origem. */
  onCancel: () => void
}

/**
 * 2a — Dialog BLOQUEANTE ao arrastar um card para "Agendado". Exige procedimento
 * e data/hora; ao salvar cria o Appointment + converte o lead em paciente
 * (via `scheduleLeadAction`). Cancelar devolve o card para a etapa de origem.
 *
 * Aplica AS MESMAS regras do dialog da agenda (CreateAppointmentDialog): bloqueia
 * agendar >1 ano no passado, e mostra avisos com confirmação (checkbox) para
 * data já passada, fora do expediente/feriado e >4 meses no futuro. Não há
 * seletor de paciente — o próprio lead vira o paciente.
 */
export function ScheduleLeadDialog({
  open,
  onOpenChange,
  clientId,
  leadId,
  leadName,
  stageId,
  procedures,
  schedule = DEFAULT_SCHEDULE,
  onScheduled,
  onCancel,
}: Props) {
  const [procedureIds, setProcedureIds] = useState<string[]>([])
  const [pickKey, setPickKey] = useState(0)
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState(60)
  const [notes, setNotes] = useState('')
  const [dateBlurred, setDateBlurred] = useState(false)
  const [pastDateAck, setPastDateAck] = useState(false)
  const [scheduleAck, setScheduleAck] = useState(false)
  const [farFutureAck, setFarFutureAck] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setProcedureIds([])
      setPickKey((k) => k + 1)
      setScheduledAt('')
      setDuration(60)
      setNotes('')
      setDateBlurred(false)
      setPastDateAck(false)
      setScheduleAck(false)
      setFarFutureAck(false)
    }
  }, [open])

  // Limite duro: 1 ano atrás. Server (scheduleLeadAction) também valida.
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

  // Duração default = soma das durações dos procedimentos selecionados.
  function sumDuration(ids: string[]): number {
    return ids.reduce((s, id) => s + (procedures.find((p) => p.id === id)?.durationMinutes ?? 0), 0)
  }

  function addProcedure(id: string) {
    setProcedureIds((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      const sum = sumDuration(next)
      if (sum > 0) setDuration(sum)
      return next
    })
    setPickKey((k) => k + 1)
  }

  function removeProcedure(index: number) {
    setProcedureIds((prev) => {
      const next = prev.filter((_, i) => i !== index)
      const sum = sumDuration(next)
      if (sum > 0) setDuration(sum)
      return next
    })
  }

  function cancel() {
    onOpenChange(false)
    onCancel()
  }

  function confirm() {
    if (!leadId) return
    if (procedureIds.length === 0) {
      toast.error('Selecione ao menos um procedimento')
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
      const res = await scheduleLeadAction(leadId, clientId, {
        stageId,
        procedureIds,
        scheduledAt,
        durationMinutes: duration,
        notes: notes || undefined,
      })
      if (!res.success) {
        toast.error(res.error.message)
        onOpenChange(false)
        onCancel()
        return
      }
      toast.success('Agendamento criado')
      onOpenChange(false)
      onScheduled()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Fechar pelo X / overlay = cancelar (reverte o card).
        if (!o) cancel()
        else onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md" aria-describedby="schedule-lead-desc">
        <DialogHeader>
          <DialogTitle>Agendar — {leadName}</DialogTitle>
          <DialogDescription id="schedule-lead-desc">
            Mover para Agendado exige criar um agendamento. O cliente será convertido em paciente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="schedule-procedure">Procedimentos *</Label>
            <Select key={pickKey} onValueChange={addProcedure}>
              <SelectTrigger id="schedule-procedure">
                <SelectValue placeholder="Adicionar procedimento..." />
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
            {procedureIds.length > 0 && (
              <ul className="mt-2 space-y-1">
                {procedureIds.map((id, i) => {
                  const proc = procedures.find((p) => p.id === id)
                  return (
                    <li
                      key={`${id}-${i}`}
                      className="flex items-center justify-between rounded-md border bg-muted/40 px-2 py-1 text-sm"
                    >
                      <span>{proc?.name ?? 'Procedimento'}</span>
                      <span className="flex items-center gap-2">
                        {proc?.durationMinutes ? (
                          <span className="text-muted-foreground">{proc.durationMinutes}min</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeProcedure(i)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remover procedimento"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            {procedures.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum procedimento cadastrado. Cadastre um na aba Procedimentos antes de agendar.
              </p>
            )}
          </div>

          {/* Data/hora ocupa 2 de 3 colunas — ver create-appointment-dialog. */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="schedule-when">Data e hora *</Label>
              <DateTimeInput
                id="schedule-when"
                min={minScheduledAttr}
                value={scheduledAt}
                onChange={(e) => {
                  setScheduledAt(e.target.value)
                  setPastDateAck(false)
                  setScheduleAck(false)
                  setFarFutureAck(false)
                }}
                onBlur={() => setDateBlurred(true)}
                invalid={isTooOld}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="schedule-duration">Duração (min)</Label>
              <Input
                id="schedule-duration"
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
              htmlFor="schedule-past-ack"
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                pastDateAck
                  ? 'border-emerald-300 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/50 dark:text-red-200'
              }`}
            >
              <input
                id="schedule-past-ack"
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
              htmlFor="schedule-schedule-ack"
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                scheduleAck
                  ? 'border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'border-orange-400 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-200'
              }`}
            >
              <input
                id="schedule-schedule-ack"
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
              htmlFor="schedule-future-ack"
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                farFutureAck
                  ? 'border-blue-300 bg-blue-50/60 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
                  : 'border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200'
              }`}
            >
              <input
                id="schedule-future-ack"
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
            <Label htmlFor="schedule-notes">Observações</Label>
            <textarea
              id="schedule-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Observações opcionais..."
            />
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
              procedures.length === 0 ||
              procedureIds.length === 0 ||
              !scheduledAt ||
              isTooOld ||
              blockedByPastWarning ||
              blockedBySchedule ||
              blockedByFarFuture
            }
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
