'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, Check, UserX, AlertTriangle, CalendarClock, Clock, Star } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DateTimeInput } from '@/components/ui/date-time-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toSPWallClock } from '@/lib/calendar-time'
import { cn } from '@/lib/utils'
import {
  updateAppointmentStatusAction,
  updateAppointmentAction,
  confirmRevenueFromAppointmentAction,
  attendAppointmentAction,
} from '@/server/actions/appointment-actions'
import { getPatientAction } from '@/server/actions/patient-actions'
import type { ProcedureForSelect } from '@/server/repositories/procedure-repository'
import { RevenueDetailsDialog } from '@/modules/financial/revenue-details-dialog'
import type { RevenueDetails } from '@/modules/financial/types'
import { AttendAppointmentDialog } from './attend-appointment-dialog'
import { STATUS_LABELS } from './types'
import type { AppointmentEvent } from './types'

// Janela em que o atendimento já é "acionável": faltando até 30 min para o
// horário, ou já tendo passado. Antes disso, o fluxo é cancelar/reagendar.
const ATTENDANCE_WINDOW_MS = 30 * 60 * 1000

/** Badge de status em pares texto+fundo dos tokens (design.md §1) — nada de hex. */
const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: 'bg-info-bg text-info-t',
  CONFIRMED: 'bg-ok-bg text-ok',
  ATTENDED: 'bg-ok-bg text-ok',
  NO_SHOW: 'bg-destructive/10 text-destructive',
  CANCELED: 'bg-muted text-muted-foreground',
  RESCHEDULED: 'bg-warn-bg text-warn',
}

const OVERLINE = 'text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground'

/** 90 → "1h 30min"; 45 → "45 min". */
function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

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
  /** Catálogo da clínica — resolve nome/duração de CADA procedimento do combo
   *  (o evento só carrega os ids). Ausente = cai no procedimento principal. */
  procedures?: ProcedureForSelect[]
  onClose: () => void
  onUpdated: () => void
}

export function AppointmentDetailDialog({
  open,
  appointment,
  clientId,
  procedures = [],
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
  // Qual botão disparou a transição — `isPending` é do useTransition inteiro e
  // fazia o spinner acender no botão errado (clicar Faltou girava Compareceu).
  const [pendingAction, setPendingAction] = useState<'attend' | 'noshow' | null>(null)
  // Compareceu pela agenda: dialog bloqueante que completa o cadastro (5 campos).
  const [showAttendDialog, setShowAttendDialog] = useState(false)

  if (!appointment) return null

  const isTerminal = ['ATTENDED', 'NO_SHOW', 'CANCELED'].includes(appointment.status)
  // Vínculo com a pipeline (Fase 2): lead já excluído → aviso piscante (feat4).
  const leadDeleted = appointment.lead?.deletedAt != null
  // Compareceu mas a receita ainda não foi lançada (usuário escolheu "registrar
  // depois"). Reabrir o agendamento oferece o botão p/ lançar a baixa agora.
  const attendedNoRevenue = appointment.status === 'ATTENDED' && !appointment.revenue

  // Faltando até 30 min para o horário, ou já passou → marcar comparecimento/
  // falta. Mais de 30 min antes → só cancelar ou reagendar.
  const startMs = new Date(appointment.scheduledAt).getTime()
  const inAttendanceWindow = Date.now() >= startMs - ATTENDANCE_WINDOW_MS

  // Faixa de horário em wall-clock SP (mesma convenção da grade e da Lista).
  const startWall = toSPWallClock(appointment.scheduledAt)
  const startLabel = startWall.slice(11, 16)
  const endLabel = toSPWallClock(new Date(startMs + appointment.durationMinutes * 60_000)).slice(
    11,
    16
  )
  const [wy, wm, wd] = startWall.slice(0, 10).split('-').map(Number)
  const dateLabel = format(new Date(wy, wm - 1, wd), "EEE, dd 'de' MMMM", { locale: ptBR })

  // Combo: procedureIds[0] == procedureId. Procedimento inativo/excluído não
  // volta no catálogo — o principal cai no que veio no próprio evento.
  const procedureIds =
    appointment.procedureIds && appointment.procedureIds.length > 0
      ? appointment.procedureIds
      : [appointment.procedureId]
  const procedureRows = procedureIds.map((id, i) => {
    const found = procedures.find((p) => p.id === id)
    if (found) return { key: `${id}-${i}`, name: found.name, minutes: found.durationMinutes }
    if (id === appointment.procedureId) {
      return {
        key: `${id}-${i}`,
        name: appointment.procedure.name,
        minutes: appointment.procedure.durationMinutes,
      }
    }
    return { key: `${id}-${i}`, name: 'Procedimento', minutes: null }
  })
  const singleProcedure = procedureRows.length === 1

  // Compareceu pela agenda. Se o paciente já está cadastrado com os 5 campos
  // completos (nome/telefone/e-mail/nascimento/CPF), marca o comparecimento
  // direto e segue p/ a receita — SEM abrir o dialog de completar cadastro. Lead
  // ou paciente com dados incompletos → abre o dialog para completar.
  function handleAttendClick() {
    if (!appointment) return
    setPendingAction('attend')
    startTransition(async () => {
      try {
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
      } finally {
        setPendingAction(null)
      }
    })
  }

  // Faltou (NO_SHOW). Compareceu (ATTENDED) NÃO passa por aqui — abre o dialog
  // que completa o cadastro (`showAttendDialog`).
  function handleNoShow() {
    if (!appointment) return
    setPendingAction('noshow')
    startTransition(async () => {
      try {
        const result = await updateAppointmentStatusAction(appointment.id, clientId, 'NO_SHOW')
        if (!result.success) {
          toast.error(result.error.message)
          return
        }
        // Vermelho: registrar falta não é conquista — o toast verde de sucesso
        // lia como recompensa.
        toast.error(`Status atualizado: ${STATUS_LABELS.NO_SHOW}`)
        onUpdated()
        onClose()
      } finally {
        setPendingAction(null)
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

  const statusBadge = STATUS_BADGE[appointment.status] ?? 'bg-muted text-muted-foreground'
  const attendanceHint = 'Disponível a partir de 30 min antes do horário'

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose()
        }}
      >
        {/* Padding zero no container: cada faixa (cabeçalho / corpo / ações)
            tem o seu, e as divisórias sangram de ponta a ponta. */}
        <DialogContent
          className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[480px]"
          aria-describedby={undefined}
        >
          {/* Topo: status + paciente à esquerda, faixa de horário à direita. O
              `pr-12` reserva a faixa do "X" do dialog (absoluto em right-4
              top-4, 16px) + folga — sem isso o horário encosta nele. */}
          <DialogHeader className="space-y-0 px-6 pb-5 pr-12 pt-6 text-left sm:text-left">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <span
                  className={cn(
                    'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    statusBadge
                  )}
                >
                  {STATUS_LABELS[appointment.status] ?? appointment.status}
                </span>
                <DialogTitle className="mt-2.5 truncate text-[19px] leading-tight">
                  {appointment.patient.name}
                </DialogTitle>
              </div>
              <div className="shrink-0 text-right">
                <p className="flex items-center justify-end gap-1.5 text-[16px] font-semibold tabular-nums leading-tight">
                  <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                  {startLabel} – {endLabel}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{dateLabel}</p>
              </div>
            </div>
          </DialogHeader>

          {showRevenuePrompt ? (
            <div className="border-t border-border px-6 py-5">
              {/* Título/corpo neutros (sem faixa verde): o próximo passo é o
                  dialog de receita, que usa a paleta dourada padrão — a caixa
                  de sucesso criava uma paleta que morria no clique seguinte. */}
              <p className="text-[14px] font-semibold text-foreground">Comparecimento registrado</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Deseja registrar a receita deste atendimento com base no preço do procedimento?
              </p>
              {/* Um botão em cada extremidade, mesma largura mínima p/ não
                  ficarem desiguais. */}
              <div className="mt-5 flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  className="min-w-[150px]"
                  onClick={handleSkipRevenue}
                  disabled={isPending}
                >
                  Registrar depois
                </Button>
                <Button
                  className="min-w-[150px]"
                  onClick={() => setShowRevenueDetails(true)}
                  disabled={isPending}
                >
                  Registrar receita
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4 border-t border-border px-6 py-4">
                {leadDeleted && (
                  <div className="flex items-center gap-2 rounded-[9px] border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" aria-hidden="true" />O
                    Lead que originou este agendamento foi excluído.
                  </div>
                )}

                {/* Procedimentos num ÚNICO container (cabeçalho + linhas +
                    rodapé), mesmo desenho da tabela de pacientes
                    (patients-list.tsx): moldura arredondada, faixas em
                    `bg-muted/40` e linhas separadas por `border-t`. */}
                <div className="overflow-hidden rounded-[11px] border border-border bg-card shadow-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                    <span>{procedureRows.length > 1 ? 'Procedimentos' : 'Procedimento'}</span>
                    <span>Duração</span>
                  </div>
                  <ul>
                    {procedureRows.map((p, i) => (
                      <li
                        key={p.key}
                        className={cn(
                          'flex items-center justify-between gap-3 px-3.5 py-2.5',
                          i > 0 && 'border-t border-border'
                        )}
                      >
                        <span className="min-w-0 truncate text-[13px] font-medium">{p.name}</span>
                        <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
                          {/* Procedimento único: a linha já É o total, então
                              mostra a duração REAL do agendamento (o catálogo é
                              só o default de quem agendou). */}
                          {singleProcedure
                            ? fmtDuration(appointment.durationMinutes)
                            : p.minutes
                              ? fmtDuration(p.minutes)
                              : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {/* Rodapé só no combo: duração REAL do agendamento (pode
                      divergir da soma do catálogo — quem agendou pode ter
                      ajustado). */}
                  {!singleProcedure && (
                    <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-3.5 py-2">
                      <span className="text-[12.5px] font-semibold text-primary-text">
                        Duração total
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-primary-text">
                        {fmtDuration(appointment.durationMinutes)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Observações — mesmo rótulo com estrela dourada do card do
                    cliente (client-card.tsx). Sem nota, a seção não existe. */}
                {appointment.notes && (
                  <div className="space-y-1.5">
                    <span className="flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden="true" />
                      <span className={OVERLINE}>Observações</span>
                    </span>
                    <p className="whitespace-pre-wrap break-words rounded-[9px] border border-border bg-muted/40 px-3 py-2 text-[12.5px] italic text-muted-foreground">
                      {appointment.notes}
                    </p>
                  </div>
                )}

                {/* Aviso neutro (sem verde): quem clica cai no dialog de
                    receita, que é dourado. Mesma moldura das outras faixas do
                    corpo. */}
                {attendedNoRevenue && (
                  <div className="flex items-center justify-between gap-3 rounded-[9px] border border-border bg-muted/40 px-3 py-2.5">
                    <p className="text-[12.5px] text-muted-foreground">
                      Comparecimento registrado, sem receita lançada.
                    </p>
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={() => setShowRevenueDetails(true)}
                      disabled={isPending}
                    >
                      Registrar receita
                    </Button>
                  </div>
                )}

                {showRescheduleForm && (
                  <div className="space-y-2 rounded-[9px] border border-border bg-muted/40 p-3">
                    <Label className={OVERLINE}>Nova data e hora</Label>
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
                        className="flex-1"
                      >
                        {isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <CalendarClock className="h-3 w-3" aria-hidden="true" />
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
                  <div className="space-y-2 rounded-[9px] border border-border bg-muted/40 p-3">
                    <Label className={OVERLINE}>Motivo do cancelamento</Label>
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
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
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

              {/* Ações. Os três botões dividem a MESMA largura (grid de 3) —
                  antes cada um media pelo próprio texto. Ordem pedida:
                  Reagendar → Faltou → Compareceu (o principal, na direita).
                  Ambos os desfechos são "ocos" e preenchem no hover. Abaixo
                  deles, "Cancelar" fecha o card como um rodapé. */}
              {!isTerminal && (
                <div className="border-t border-border bg-muted/30 px-6 pb-3 pt-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowRescheduleForm((v) => !v)
                        setShowCancelForm(false)
                        if (!newDateTime) {
                          setNewDateTime(toSPWallClock(appointment.scheduledAt).slice(0, 16))
                        }
                      }}
                      disabled={isPending}
                      className="text-[13px] font-semibold"
                    >
                      <CalendarClock className="h-4 w-4" aria-hidden="true" />
                      Reagendar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleNoShow}
                      disabled={isPending || !inAttendanceWindow}
                      title={inAttendanceWindow ? undefined : attendanceHint}
                      className="border-destructive/35 bg-destructive/5 text-[13px] font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      {pendingAction === 'noshow' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <UserX className="h-4 w-4" aria-hidden="true" />
                      )}
                      Faltou
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleAttendClick}
                      disabled={isPending || !inAttendanceWindow}
                      title={inAttendanceWindow ? undefined : attendanceHint}
                      className="border-ok/40 bg-ok/5 text-[13px] font-semibold text-ok hover:bg-ok hover:text-ok-bg"
                    >
                      {pendingAction === 'attend' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      )}
                      Compareceu
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCancelForm((v) => !v)
                      setShowRescheduleForm(false)
                    }}
                    disabled={isPending}
                    className="-ml-1 mt-2 rounded-md px-1 py-0.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    Cancelar agendamento
                  </button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

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
