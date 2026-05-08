'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, Check, X, UserX, AlertTriangle, Trash2 } from 'lucide-react'
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
  updateAppointmentStatusAction,
  confirmRevenueFromAppointmentAction,
  deleteAppointmentAction,
} from '@/server/actions/appointment-actions'
import { STATUS_LABELS, STATUS_COLORS } from './types'
import type { AppointmentEvent } from './types'

type Props = {
  open: boolean
  appointment: AppointmentEvent | null
  clientId: string
  onClose: () => void
  onUpdated: () => void
}

export function AppointmentDetailDialog({
  open,
  appointment,
  clientId,
  onClose,
  onUpdated,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showRevenuePrompt, setShowRevenuePrompt] = useState(false)

  if (!appointment) return null

  const isTerminal = ['ATTENDED', 'NO_SHOW', 'CANCELED'].includes(appointment.status)

  function handleStatus(status: string) {
    if (!appointment) return
    startTransition(async () => {
      const result = await updateAppointmentStatusAction(
        appointment.id,
        clientId,
        status as 'CONFIRMED' | 'ATTENDED' | 'NO_SHOW' | 'CANCELED' | 'SCHEDULED' | 'RESCHEDULED'
      )
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      if (status === 'ATTENDED') {
        setShowRevenuePrompt(true)
      } else {
        toast.success(`Status atualizado: ${STATUS_LABELS[status]}`)
        onUpdated()
        onClose()
      }
    })
  }

  function handleCancel() {
    if (!appointment || !cancelReason.trim()) return
    startTransition(async () => {
      const result = await updateAppointmentStatusAction(appointment.id, clientId, 'CANCELED', {
        cancelReason: cancelReason.trim(),
      })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Agendamento cancelado')
      setShowCancelForm(false)
      setCancelReason('')
      onUpdated()
      onClose()
    })
  }

  function handleConfirmRevenue() {
    if (!appointment) return
    startTransition(async () => {
      const result = await confirmRevenueFromAppointmentAction(
        appointment.id,
        clientId,
        appointment.patientId,
        appointment.procedureId
      )
      if (!result.success) {
        toast.error(result.error.message)
      } else {
        toast.success('Receita registrada com sucesso!')
      }
      setShowRevenuePrompt(false)
      onUpdated()
      onClose()
    })
  }

  function handleSkipRevenue() {
    setShowRevenuePrompt(false)
    toast.success('Comparecimento registrado')
    onUpdated()
    onClose()
  }

  function handleDelete() {
    if (!appointment) return
    if (!confirm('Remover este agendamento?')) return
    startTransition(async () => {
      await deleteAppointmentAction(appointment.id, clientId)
      toast.success('Agendamento removido')
      onUpdated()
      onClose()
    })
  }

  const statusColor = STATUS_COLORS[appointment.status] ?? '#6b7280'

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Agendamento
            <span
              className="rounded px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: statusColor + '20', color: statusColor }}
            >
              {STATUS_LABELS[appointment.status] ?? appointment.status}
            </span>
          </DialogTitle>
        </DialogHeader>

        {showRevenuePrompt ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <p className="font-medium">Comparecimento registrado!</p>
              <p className="mt-1">
                Deseja registrar a receita deste atendimento com base no preço do procedimento?
              </p>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={handleSkipRevenue} disabled={isPending}>
                Registrar depois
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={handleConfirmRevenue}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Registrar receita
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Paciente</p>
                  <p className="font-medium">{appointment.patient.name}</p>
                  {appointment.patient.phone && (
                    <p className="text-muted-foreground">{appointment.patient.phone}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Procedimento</p>
                  <p className="font-medium">{appointment.procedure.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data e hora</p>
                  <p className="font-medium">
                    {format(new Date(appointment.scheduledAt), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Duração</p>
                  <p className="font-medium">{appointment.durationMinutes} min</p>
                </div>
              </div>
              {appointment.notes && (
                <p className="text-sm italic text-muted-foreground">{appointment.notes}</p>
              )}
            </div>

            {!isTerminal && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {appointment.status === 'SCHEDULED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-600 hover:bg-blue-50"
                      onClick={() => handleStatus('CONFIRMED')}
                      disabled={isPending}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      Confirmar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleStatus('ATTENDED')}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-4 w-4" />
                    )}
                    Compareceu
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => handleStatus('NO_SHOW')}
                    disabled={isPending}
                  >
                    <UserX className="mr-1.5 h-4 w-4" />
                    Faltou
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => setShowCancelForm(!showCancelForm)}
                    disabled={isPending}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    Cancelar
                  </Button>
                </div>

                {showCancelForm && (
                  <div className="space-y-2 rounded-lg border border-orange-200 p-3">
                    <Label className="text-xs text-orange-700">Motivo do cancelamento</Label>
                    <Input
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Motivo..."
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleCancel}
                        disabled={!cancelReason.trim() || isPending}
                        className="flex-1"
                      >
                        {isPending ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <AlertTriangle className="mr-1.5 h-3 w-3" />
                        )}
                        Confirmar cancelamento
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowCancelForm(false)
                          setCancelReason('')
                        }}
                      >
                        Voltar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Remover
              </Button>
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
