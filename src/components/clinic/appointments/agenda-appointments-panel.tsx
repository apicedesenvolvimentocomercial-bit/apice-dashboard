'use client'

import dynamic from 'next/dynamic'
import { Plus, Settings2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { toSPWallClock } from '@/lib/calendar-time'
import { cn } from '@/lib/utils'
import { AppointmentDetailDialog } from '@/modules/appointments/appointment-detail-dialog'
import { CreateAppointmentDialog } from '@/modules/appointments/create-appointment-dialog'
import { ScheduleSettingsDialog } from '@/modules/appointments/schedule-settings-dialog'
import type { AppointmentEvent, ClinicSchedule } from '@/modules/appointments/types'
import type { PatientWithStats } from '@/server/repositories/patient-repository'
import type { ProcedureForSelect } from '@/server/repositories/procedure-repository'

import {
  localDateKey,
  toLocalISO,
  type AgendaCalendarApi,
  type AgendaDatesInfo,
  type AgendaView,
} from './agenda-fc-shared'
import { AgendaLegend } from './agenda-legend'
import { AgendaListView, type AgendaListGroup } from './agenda-list-view'
import { AgendaEmptyCard, AgendaGridSkeleton } from './agenda-states'
import { AgendaToolbar } from './agenda-toolbar'

const SennoAppointmentsCalendar = dynamic(
  () => import('./senno-appointments-calendar').then((m) => m.SennoAppointmentsCalendar),
  { ssr: false, loading: () => <AgendaGridSkeleton /> }
)

// Mesmo conjunto do calendário: cancelado/faltou ficam apagados na Lista.
const MUTED_STATUSES = new Set(['CANCELED', 'NO_SHOW'])

const fmtGroupLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })

type Props = {
  clientId: string
  appointments: AppointmentEvent[]
  patients: PatientWithStats[]
  procedures: ProcedureForSelect[]
  schedule: ClinicSchedule
  view: AgendaView
  onViewChange: (v: AgendaView) => void
}

/**
 * Painel da aba AGENDAMENTOS (agenda-handoff §4–§6, §8): toolbar de período +
 * seletor de visão, grade FullCalendar com a skin dourada, Lista custom (o FC
 * fica oculto na Lista mas segue montado como fonte única de navegação de
 * período/título) e os MESMOS dialogs de negócio de antes (criar/detalhe/
 * expediente) — fluxos de pipeline preservados.
 */
export function AgendaAppointmentsPanel({
  clientId,
  appointments,
  patients,
  procedures,
  schedule,
  view,
  onViewChange,
}: Props) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [defaultDate, setDefaultDate] = useState<string | undefined>()
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentEvent | null>(null)
  const apiRef = useRef<AgendaCalendarApi | null>(null)
  const [dates, setDates] = useState<AgendaDatesInfo | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  function handleDateSelect(dateStr: string) {
    setDefaultDate(dateStr)
    setCreateOpen(true)
  }

  /**
   * Agendamento criado FORA do período visível: navega a grade até o dia dele e
   * o realça. Dentro do período, nada disso acontece — o card já vai aparecer na
   * tela no `router.refresh()`, e navegar/piscar em cima do que o usuário já está
   * olhando só polui. O realce existe para reencontrar o que saiu de vista.
   */
  function handleCreated(created?: { appointmentId: string; scheduledAt: string }) {
    router.refresh()
    if (!created) return
    // `scheduledAt` é wall-clock local ("YYYY-MM-DDTHH:mm"); só o dia importa.
    const day = created.scheduledAt.slice(0, 10)
    // `dates.end` é EXCLUSIVO (padrão do FullCalendar), daí o `<`.
    const alreadyVisible =
      dates != null && day >= localDateKey(dates.start) && day < localDateKey(dates.end)
    if (alreadyVisible) return
    apiRef.current?.gotoDate(day)
    setHighlightId(created.appointmentId)
  }

  // O realce só começa a contar quando o card aparece de fato (pós-refresh).
  useEffect(() => {
    if (!highlightId || !appointments.some((a) => a.id === highlightId)) return
    const t = setTimeout(() => setHighlightId(null), 5000)
    return () => clearTimeout(t)
  }, [highlightId, appointments])

  function handleUpdated() {
    setSelectedAppointment(null)
    router.refresh()
  }

  // Agendamentos dentro da janela visível (comparação em wall-clock SP, igual
  // ao posicionamento na grade).
  const visible = useMemo(() => {
    if (!dates) return []
    const from = toLocalISO(dates.start)
    const to = toLocalISO(dates.end)
    return appointments.filter((a) => {
      const w = toSPWallClock(new Date(a.scheduledAt))
      return w >= from && w < to
    })
  }, [appointments, dates])

  const isEmpty = dates != null && visible.length === 0
  const showFooter = view === 'dia' || view === 'semana'
  const showLegend = view === 'semana' || view === 'mes'

  const listGroups = useMemo<AgendaListGroup[]>(() => {
    if (view !== 'lista') return []
    const byDay = new Map<string, AppointmentEvent[]>()
    const sorted = [...visible].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )
    for (const a of sorted) {
      const key = toSPWallClock(new Date(a.scheduledAt)).slice(0, 10)
      const arr = byDay.get(key)
      if (arr) arr.push(a)
      else byDay.set(key, [a])
    }
    const todayKey = toSPWallClock(new Date()).slice(0, 10)
    return [...byDay.entries()].map(([key, items]) => {
      const [y, m, d] = key.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      return {
        key,
        isToday: key === todayKey,
        dateLabel: `${fmtGroupLabel.format(date)} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
        countLabel: `${items.length} ${items.length === 1 ? 'agendamento' : 'agendamentos'}`,
        items: items.map((a) => {
          const start = new Date(a.scheduledAt)
          const startLabel = toSPWallClock(start).slice(11, 16)
          const endLabel = toSPWallClock(
            new Date(start.getTime() + a.durationMinutes * 60_000)
          ).slice(11, 16)
          const extra =
            a.procedureIds && a.procedureIds.length > 1 ? ` +${a.procedureIds.length - 1}` : ''
          return {
            id: a.id,
            timeLabel: `${startLabel} – ${endLabel}`,
            title: a.patient.name,
            subtitle: `${a.procedure.name}${extra}`,
            durLabel: `${a.durationMinutes} min`,
            muted: MUTED_STATUSES.has(a.status),
            onClick: () => setSelectedAppointment(a),
          }
        }),
      }
    })
  }, [view, visible])

  return (
    <div className="flex flex-col gap-3.5">
      <AgendaToolbar
        title={dates?.title ?? ''}
        view={view}
        onViewChange={onViewChange}
        onPrev={() => apiRef.current?.prev()}
        onNext={() => apiRef.current?.next()}
        onToday={() => apiRef.current?.today()}
        actionLabel="Novo agendamento"
        actionIcon={Plus}
        onAction={() => {
          setDefaultDate(undefined)
          setCreateOpen(true)
        }}
      >
        <button
          type="button"
          title="Configurações do expediente"
          aria-label="Configurações do expediente"
          onClick={() => setSettingsOpen(true)}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings2 className="h-[17px] w-[17px]" aria-hidden="true" />
        </button>
      </AgendaToolbar>

      {/* Na Lista o FC fica oculto porém montado — as setas/"Hoje" continuam
          navegando a MESMA janela de semana e o título segue dele. */}
      <div className={cn('relative', view === 'lista' && 'hidden')}>
        <div className="senno-agenda overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
          <SennoAppointmentsCalendar
            appointments={appointments}
            schedule={schedule}
            view={view}
            highlightId={highlightId}
            onApi={(api) => {
              apiRef.current = api
            }}
            onDatesChange={setDates}
            onEventClick={setSelectedAppointment}
            onDateSelect={handleDateSelect}
          />
          {showFooter && (
            <div className="flex items-center justify-center gap-2 border-t border-border bg-muted/50 px-3 py-[9px] text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />
              Fim de expediente — {schedule.workdayEnd}
            </div>
          )}
        </div>
      </div>

      {view === 'lista' &&
        (isEmpty ? (
          <AgendaEmptyCard
            title="Nenhum agendamento neste período"
            hint="Crie um agendamento ou navegue até outra semana."
            actionLabel="Novo agendamento"
            onAction={() => {
              setDefaultDate(undefined)
              setCreateOpen(true)
            }}
          />
        ) : (
          <AgendaListView groups={listGroups} highlightId={highlightId} />
        ))}

      {showLegend && (
        <AgendaLegend
          workdays={schedule.workdays}
          holidays={schedule.holidays}
          variant={view === 'mes' ? 'mes' : 'semana'}
        />
      )}

      <CreateAppointmentDialog
        open={createOpen}
        clientId={clientId}
        patients={patients}
        procedures={procedures}
        defaultDate={defaultDate}
        schedule={schedule}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <ScheduleSettingsDialog
        open={settingsOpen}
        clientId={clientId}
        schedule={schedule}
        onOpenChange={setSettingsOpen}
        onSaved={() => router.refresh()}
      />

      <AppointmentDetailDialog
        open={selectedAppointment !== null}
        appointment={selectedAppointment}
        clientId={clientId}
        procedures={procedures}
        onClose={() => setSelectedAppointment(null)}
        onUpdated={handleUpdated}
      />
    </div>
  )
}
