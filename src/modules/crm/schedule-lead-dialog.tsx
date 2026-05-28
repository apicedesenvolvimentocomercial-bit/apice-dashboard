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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { scheduleLeadAction } from '@/server/actions/lead-actions'

export type ProcedureOption = {
  id: string
  name: string
  durationMinutes: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  leadId: string | null
  leadName: string
  stageId: string
  procedures: ProcedureOption[]
  /** Confirmado com sucesso → o board persiste o move. */
  onScheduled: () => void
  /** Cancelado/erro → o board reverte o card para a etapa de origem. */
  onCancel: () => void
}

// Valor inicial de datetime-local: agora, arredondado, no fuso local do browser.
function defaultDateTimeLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

/**
 * 2a — Dialog BLOQUEANTE ao arrastar um card para "Agendado". Exige procedimento
 * e data/hora; ao salvar cria o Appointment + converte o lead em paciente
 * (via `scheduleLeadAction`). Cancelar devolve o card para a etapa de origem.
 */
export function ScheduleLeadDialog({
  open,
  onOpenChange,
  clientId,
  leadId,
  leadName,
  stageId,
  procedures,
  onScheduled,
  onCancel,
}: Props) {
  const [procedureId, setProcedureId] = useState('')
  const [scheduledAt, setScheduledAt] = useState(defaultDateTimeLocal())
  const [duration, setDuration] = useState(60)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setProcedureId('')
      setScheduledAt(defaultDateTimeLocal())
      setDuration(60)
    }
  }, [open])

  // Ao escolher procedimento, herda a duração padrão dele.
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
    if (!leadId) return
    if (!procedureId) {
      toast.error('Selecione um procedimento')
      return
    }
    if (!scheduledAt) {
      toast.error('Informe a data e hora')
      return
    }
    startTransition(async () => {
      const res = await scheduleLeadAction(leadId, clientId, {
        stageId,
        procedureId,
        scheduledAt,
        durationMinutes: duration,
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
      <DialogContent aria-describedby="schedule-lead-desc">
        <DialogHeader>
          <DialogTitle>Agendar — {leadName}</DialogTitle>
          <DialogDescription id="schedule-lead-desc">
            Mover para Agendado exige criar um agendamento. O cliente será convertido em paciente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="schedule-procedure">Procedimento</Label>
            <select
              id="schedule-procedure"
              value={procedureId}
              onChange={(e) => pickProcedure(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Selecione…</option>
              {procedures.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {procedures.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum procedimento cadastrado. Cadastre um na aba Procedimentos antes de agendar.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="schedule-when">Data e hora</Label>
              <Input
                id="schedule-when"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="schedule-duration">Duração (min)</Label>
              <Input
                id="schedule-duration"
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirm} disabled={pending || procedures.length === 0}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
