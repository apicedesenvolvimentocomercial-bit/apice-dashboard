'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, Check, X, UserX, AlertTriangle, Trash2, CalendarClock } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { DateTimeInput } from '@/components/ui/date-time-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toSPWallClock } from '@/lib/calendar-time'
import {
  updateAppointmentStatusAction,
  updateAppointmentAction,
  confirmRevenueFromAppointmentAction,
  attendAppointmentAction,
  deleteAppointmentAction,
  regressAppointmentToLeadAction,
} from '@/server/actions/appointment-actions'
import { getPatientAction } from '@/server/actions/patient-actions'
import { RevenueDetailsDialog } from '@/modules/financial/revenue-details-dialog'
import type { RevenueDetails } from '@/modules/financial/types'
import { AttendAppointmentDialog } from './attend-appointment-dialog'
import { STATUS_LABELS, STATUS_COLORS } from './types'
import type { AppointmentEvent } from './types'

// Janela em que o atendimento já é "acionável": faltando até 30 min para o
// horário, ou já tendo passado. Antes disso, o fluxo é cancelar/reagendar.
const ATTENDANCE_WINDOW_MS = 30 * 60 * 1000

// birthDate é gravado como meia-noite UTC; lê pelos componentes UTC p/ não deslocar
// o dia no fuso local (mesma convenção do attend-appointment-dialog).
function birthToDateInput(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

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
  const [showRescheduleForm, setShowRescheduleForm] = useState(false)
  const [newDateTime, setNewDateTime] = useState('')
  const [showRevenuePrompt, setShowRevenuePrompt] = useState(false)
  // Dialog de detalhes da baixa (forma/parcelas/desconto) — mesmo nível do manual.
  const [showRevenueDetails, setShowRevenueDetails] = useState(false)
  const [showRegressWarn, setShowRegressWarn] = useState(false)
  // Compareceu pela agenda: dialog bloqueante que completa o cadastro (5 campos).
  const [showAttendDialog, setShowAttendDialog] = useState(false)

  if (!appointment) return null

  const isTerminal = ['ATTENDED', 'NO_SHOW', 'CANCELED'].includes(appointment.status)
  // Vínculo com a pipeline (Fase 2). Lead ativo → excluir o agendamento
  // retrocede o card (feat2). Lead já excluído → aviso piscante (feat4).
  const hasActiveLead = !!appointment.lead && appointment.lead.deletedAt == null
  const leadDeleted = appointment.lead?.deletedAt != null
  // Compareceu mas a receita ainda não foi lançada (usuário escolheu "registrar
  // depois"). Reabrir o agendamento oferece o botão p/ lançar a baixa agora.
  const attendedNoRevenue = appointment.status === 'ATTENDED' && !appointment.revenue

  // Faltando até 30 min para o horário, ou já passou → marcar comparecimento/
  // falta. Mais de 30 min antes → só cancelar ou reagendar.
  const startMs = new Date(appointment.scheduledAt).getTime()
  const inAttendanceWindow = Date.now() >= startMs - ATTENDANCE_WINDOW_MS

  // Compareceu pela agenda. Se o paciente já está cadastrado com os 5 campos
  // completos (nome/telefone/e-mail/nascimento/CPF), marca o comparecimento
  // direto e segue p/ a receita — SEM abrir o dialog de completar cadastro. Lead
  // ou paciente com dados incompletos → abre o dialog para completar.
  function handleAttendClick() {
    if (!appointment) return
    startTransition(async () => {
      const res = await getPatientAction(appointment.patientId, clientId)
      if (res.success) {
        const p = res.data
        const complete = !!(p.name && p.phone && p.email && p.birthDate && p.cpf)
        if (complete) {
          const attend = await attendAppointmentAction(appointment.id, clientId, {
            name: p.name,
            phone: p.phone!,
            email: p.email!,
            birthDate: birthToDateInput(p.birthDate),
            cpf: p.cpf!,
          })
          if (!attend.success) {
            toast.error(attend.error.message)
            return
          }
          toast.success('Comparecimento registrado')
          setShowRevenuePrompt(true)
          return
        }
      }
      // Lead, dados incompletos ou falha ao ler → completa pelo dialog.
      setShowAttendDialog(true)
    })
  }

  // Faltou (NO_SHOW) e demais status diretos. Compareceu (ATTENDED) NÃO passa
  // por aqui — abre o dialog que completa o cadastro (`showAttendDialog`).
  function handleStatus(status: string) {
    if (!appointment) return
    startTransition(async () => {
      const result = await updateAppointmentStatusAction(
        appointment.id,
        clientId,
        status as 'CONFIRMED' | 'NO_SHOW' | 'CANCELED' | 'SCHEDULED' | 'RESCHEDULED'
      )
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success(`Status atualizado: ${STATUS_LABELS[status]}`)
      onUpdated()
      onClose()
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

  function handleReschedule() {
    if (!appointment || !newDateTime) return
    startTransition(async () => {
      // Reagendar = mover o scheduledAt. É a única fonte de verdade da data:
      // calendário, bucketing de KPI por período, relatórios e exports leem
      // dela ao vivo, então mover aqui propaga para todo o sistema. Status
      // segue SCHEDULED (continua acionável no novo horário). Receita só é
      // criada no comparecimento, então não há nada a corrigir lá.
      const result = await updateAppointmentAction(appointment.id, clientId, {
        scheduledAt: newDateTime,
      })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Agendamento remarcado')
      setShowRescheduleForm(false)
      setNewDateTime('')
      onUpdated()
      onClose()
    })
  }

  function handleConfirmRevenue(details: RevenueDetails) {
    if (!appointment) return
    startTransition(async () => {
      const result = await confirmRevenueFromAppointmentAction(
        appointment.id,
        clientId,
        appointment.patientId,
        appointment.procedureId,
        details
      )
      if (!result.success) {
        toast.error(result.error.message)
      } else {
        toast.success('Receita registrada com sucesso!')
      }
      setShowRevenueDetails(false)
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
    // feat2 — agendamento gerado pela pipeline: avisa que vai retroceder o card.
    if (hasActiveLead) {
      setShowRegressWarn(true)
      return
    }
    if (!confirm('Remover este agendamento?')) return
    startTransition(async () => {
      await deleteAppointmentAction(appointment.id, clientId)
      toast.success('Agendamento removido')
      onUpdated()
      onClose()
    })
  }

  function confirmRegress() {
    if (!appointment) return
    startTransition(async () => {
      const res = await regressAppointmentToLeadAction(appointment.id, clientId)
      setShowRegressWarn(false)
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success('Agendamento removido — card retornou para Lead')
      onUpdated()
      onClose()
    })
  }

  const statusColor = STATUS_COLORS[appointment.status] ?? '#6b7280'

  return (
    <>
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

          {leadDeleted && (
            <div className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />O Lead que originou este
              agendamento foi excluído.
            </div>
          )}

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
                  onClick={() => setShowRevenueDetails(true)}
                  disabled={isPending}
                >
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
                    <p className="text-xs text-muted-foreground">
                      {appointment.procedureIds && appointment.procedureIds.length > 1
                        ? 'Procedimentos'
                        : 'Procedimento'}
                    </p>
                    <p className="font-medium">
                      {appointment.procedure.name}
                      {appointment.procedureIds && appointment.procedureIds.length > 1
                        ? ` +${appointment.procedureIds.length - 1}`
                        : ''}
                    </p>
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
                  {inAttendanceWindow ? (
                    // Próximo do horário ou já passou: registrar o desfecho.
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={handleAttendClick}
                        disabled={isPending}
                      >
                        <Check className="mr-1.5 h-4 w-4" />
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
                    </div>
                  ) : (
                    // Faltando mais de 30 min: cancelar (não conta como no-show)
                    // ou reagendar para outro dia.
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowRescheduleForm((v) => !v)
                          setShowCancelForm(false)
                          if (!newDateTime) {
                            setNewDateTime(toSPWallClock(appointment.scheduledAt).slice(0, 16))
                          }
                        }}
                        disabled={isPending}
                      >
                        <CalendarClock className="mr-1.5 h-4 w-4" />
                        Reagendar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => {
                          setShowCancelForm((v) => !v)
                          setShowRescheduleForm(false)
                        }}
                        disabled={isPending}
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        Cancelar
                      </Button>
                    </div>
                  )}

                  {showRescheduleForm && (
                    <div className="space-y-2 rounded-lg border border-amber-200 p-3">
                      <Label className="text-xs text-amber-700">Nova data e hora</Label>
                      <DateTimeInput
                        value={newDateTime}
                        min={toSPWallClock(new Date()).slice(0, 16)}
                        onChange={(e) => setNewDateTime(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleReschedule}
                          disabled={!newDateTime || isPending}
                          className="flex-1 bg-amber-600 hover:bg-amber-700"
                        >
                          {isPending ? (
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          ) : (
                            <CalendarClock className="mr-1.5 h-3 w-3" />
                          )}
                          Confirmar reagendamento
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowRescheduleForm(false)}
                        >
                          Voltar
                        </Button>
                      </div>
                    </div>
                  )}

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

              {attendedNoRevenue && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/40">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Comparecimento registrado, sem receita lançada.
                  </p>
                  <Button
                    size="sm"
                    className="mt-2 bg-green-600 hover:bg-green-700"
                    onClick={() => setShowRevenueDetails(true)}
                    disabled={isPending}
                  >
                    <Check className="mr-1.5 h-4 w-4" />
                    Registrar receita
                  </Button>
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

      {/* feat2 — Aviso ao excluir agendamento que veio da pipeline. */}
      <AlertDialog open={showRegressWarn} onOpenChange={setShowRegressWarn}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Fazer isso retrocederá o agendamento para Lead. O card volta para a etapa inicial do
              funil e o comparecimento/baixa financeira (se houver) são desfeitos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRegress} disabled={isPending}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Sim, retroceder para Lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Compareceu pela agenda: completa o cadastro (5 campos) e move o card
          ligado para Compareceu. Ao confirmar, abre o prompt de receita. */}
      <AttendAppointmentDialog
        open={showAttendDialog}
        onOpenChange={setShowAttendDialog}
        clientId={clientId}
        appointmentId={appointment.id}
        patientId={appointment.patientId}
        defaults={{ name: appointment.patient.name, phone: appointment.patient.phone }}
        onAttended={() => {
          setShowAttendDialog(false)
          setShowRevenuePrompt(true)
        }}
        onCancel={() => setShowAttendDialog(false)}
      />

      {/* Baixa financeira com detalhes (forma/parcelas/desconto) — igual ao manual. */}
      <RevenueDetailsDialog
        open={showRevenueDetails}
        onOpenChange={setShowRevenueDetails}
        title="Registrar receita"
        description="Informe a forma de pagamento, parcelas e desconto da baixa."
        pending={isPending}
        onConfirm={handleConfirmRevenue}
      />
    </>
  )
}
