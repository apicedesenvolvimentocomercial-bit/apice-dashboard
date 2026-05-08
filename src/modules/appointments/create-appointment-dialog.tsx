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
import { createAppointmentAction } from '@/server/actions/appointment-actions'
import type { PatientWithStats } from '@/server/repositories/patient-repository'
import type { ProcedureForSelect } from '@/server/repositories/procedure-repository'

type Props = {
  open: boolean
  clientId: string
  patients: PatientWithStats[]
  procedures: ProcedureForSelect[]
  defaultDate?: string
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function CreateAppointmentDialog({
  open,
  clientId,
  patients,
  procedures,
  defaultDate,
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
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.patientId || !form.procedureId || !form.scheduledAt) {
      toast.error('Preencha todos os campos obrigatórios')
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
                value={form.scheduledAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
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
              disabled={isPending || !form.patientId || !form.procedureId || !form.scheduledAt}
            >
              {isPending ? 'Salvando...' : 'Agendar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
