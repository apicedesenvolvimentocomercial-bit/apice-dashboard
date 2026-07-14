'use client'

import dynamic from 'next/dynamic'
import { AlertTriangle, CalendarPlus } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { ClinicEventDialog } from '@/components/clinic/calendar/clinic-event-dialog'
import { mapCalendarEventToFc } from '@/components/shared/calendar/fc-event-mapping'
import { getClinicCalendarRangeAction } from '@/domains/clinic/calendar/calendar-event-actions'
import { cn } from '@/lib/utils'
import type { ClinicSchedule } from '@/modules/appointments/types'
import type { CalendarEvent, CalendarHoliday } from '@/shared/calendar-types'

import {
  toLocalISO,
  type AgendaCalendarApi,
  type AgendaDatesInfo,
  type AgendaView,
} from './agenda-fc-shared'
import { AgendaLegend } from './agenda-legend'
import { AgendaListView, type AgendaListGroup } from './agenda-list-view'
import { AgendaEmptyCard, AgendaEmptyOverlay, AgendaGridSkeleton } from './agenda-states'
import { AgendaToolbar } from './agenda-toolbar'

const SennoPersonalCalendar = dynamic(
  () => import('./senno-personal-calendar').then((m) => m.SennoPersonalCalendar),
  { ssr: false, loading: () => <AgendaGridSkeleton /> }
)

const fmtGroupLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })

type Props = {
  initialEvents: CalendarEvent[]
  initialHolidays: CalendarHoliday[]
  schedule: ClinicSchedule
  view: AgendaView
  onViewChange: (v: AgendaView) => void
}

/**
 * Painel da aba CALENDÁRIO (pessoal) — mesma toolbar/visões da aba
 * Agendamentos, ação "Novo evento" (agenda-handoff §4.3) e os dialogs de
 * evento do domínio clínica. Navegar de período refaz o fetch da janela
 * visível (comportamento preservado do ClinicUserCalendar); falha vira erro
 * INLINE com "Recarregar" (nunca alert).
 */
export function AgendaPersonalPanel({
  initialEvents,
  initialHolidays,
  schedule,
  view,
  onViewChange,
}: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [holidays, setHolidays] = useState<CalendarHoliday[]>(initialHolidays)
  const [createOpen, setCreateOpen] = useState(false)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const apiRef = useRef<AgendaCalendarApi | null>(null)
  const [dates, setDates] = useState<AgendaDatesInfo | null>(null)
  const rangeRef = useRef<{ from: string; to: string } | null>(null)

  const loadRange = useCallback((from: string, to: string) => {
    rangeRef.current = { from, to }
    getClinicCalendarRangeAction(from, to)
      .then((res) => {
        if (res.success) {
          setEvents(res.data.events)
          setHolidays(res.data.holidays)
          setLoadError(false)
        } else {
          setLoadError(true)
        }
      })
      .catch(() => setLoadError(true))
  }, [])

  const handleDatesChange = useCallback(
    (info: AgendaDatesInfo) => {
      setDates(info)
      const from = info.start.toISOString()
      const to = info.end.toISOString()
      // Evita refetch redundante ao alternar Semana↔Lista (mesma janela).
      if (rangeRef.current?.from === from && rangeRef.current?.to === to) return
      loadRange(from, to)
    },
    [loadRange]
  )

  const refetch = useCallback(() => {
    const r = rangeRef.current
    if (r) loadRange(r.from, r.to)
  }, [loadRange])

  // Eventos na janela visível, já em wall-clock SP (mesma régua da grade).
  const visible = useMemo(() => {
    if (!dates) return []
    const from = toLocalISO(dates.start)
    const to = toLocalISO(dates.end)
    return events
      .map((e) => ({ event: e, mapped: mapCalendarEventToFc(e) }))
      .filter(({ mapped }) => {
        const start = mapped.allDay ? `${mapped.start}T00:00:00` : mapped.start
        return start >= from && start < to
      })
  }, [events, dates])

  const isEmpty = dates != null && visible.length === 0
  const showFooter = view === 'dia' || view === 'semana'
  const showLegend = view === 'semana' || view === 'mes'

  const listGroups = useMemo<AgendaListGroup[]>(() => {
    if (view !== 'lista') return []
    const byDay = new Map<string, typeof visible>()
    const sorted = [...visible].sort((a, b) => a.mapped.start.localeCompare(b.mapped.start))
    for (const item of sorted) {
      const key = item.mapped.start.slice(0, 10)
      const arr = byDay.get(key)
      if (arr) arr.push(item)
      else byDay.set(key, [item])
    }
    const now = new Date()
    const todayKey = toLocalISO(now).slice(0, 10)
    return [...byDay.entries()].map(([key, items]) => {
      const [y, m, d] = key.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      return {
        key,
        isToday: key === todayKey,
        dateLabel: `${fmtGroupLabel.format(date)} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
        countLabel: `${items.length} ${items.length === 1 ? 'evento' : 'eventos'}`,
        items: items.map(({ event, mapped }) => ({
          id: event.id,
          timeLabel: mapped.allDay
            ? 'Dia inteiro'
            : `${mapped.start.slice(11, 16)}${mapped.end ? ` – ${mapped.end.slice(11, 16)}` : ''}`,
          title: event.title,
          subtitle: event.category,
          dotColor: event.color,
          onClick: () => setEditEventId(event.id),
        })),
      }
    })
  }, [view, visible])

  const editing = editEventId ? (events.find((e) => e.id === editEventId) ?? null) : null

  return (
    <div className="flex flex-col gap-3.5">
      <AgendaToolbar
        title={dates?.title ?? ''}
        view={view}
        onViewChange={onViewChange}
        onPrev={() => apiRef.current?.prev()}
        onNext={() => apiRef.current?.next()}
        onToday={() => apiRef.current?.today()}
        actionLabel="Novo evento"
        actionIcon={CalendarPlus}
        onAction={() => setCreateOpen(true)}
      />

      {loadError && (
        <div className="flex items-center gap-3 rounded-[13px] border border-destructive/30 bg-destructive/10 px-[18px] py-3.5">
          <AlertTriangle
            className="h-[18px] w-[18px] flex-none text-destructive"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-destructive">
              Erro ao carregar os eventos deste período
            </div>
            <div className="text-[12.5px] text-muted-foreground">
              Verifique a conexão e tente novamente.
            </div>
          </div>
          <button
            type="button"
            onClick={refetch}
            className="h-[30px] flex-none rounded-[7px] border border-destructive/40 bg-transparent px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            Recarregar
          </button>
        </div>
      )}

      <div className={cn('relative', view === 'lista' && 'hidden')}>
        <div className="senno-agenda overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
          <SennoPersonalCalendar
            events={events}
            holidays={holidays}
            workdays={schedule.workdays}
            view={view}
            onApi={(api) => {
              apiRef.current = api
            }}
            onDatesChange={handleDatesChange}
            onEventClick={setEditEventId}
          />
          {showFooter && (
            <div className="flex items-center justify-center gap-2 border-t border-border bg-muted/50 px-3 py-[9px] text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />
              Fim de expediente — {schedule.workdayEnd}
            </div>
          )}
        </div>
        {isEmpty && view !== 'lista' && (
          <AgendaEmptyOverlay
            title="Nenhum evento neste período"
            hint="Crie um evento ou navegue até outra data."
            actionLabel="Novo evento"
            onAction={() => setCreateOpen(true)}
          />
        )}
      </div>

      {view === 'lista' &&
        (isEmpty ? (
          <AgendaEmptyCard
            title="Nenhum evento neste período"
            hint="Crie um evento ou navegue até outra semana."
            actionLabel="Novo evento"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <AgendaListView groups={listGroups} />
        ))}

      {showLegend && (
        <AgendaLegend
          workdays={schedule.workdays}
          holidays={holidays}
          variant={view === 'mes' ? 'mes' : 'semana'}
        />
      )}

      <ClinicEventDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onChanged={refetch}
      />

      <ClinicEventDialog
        mode="edit"
        open={editing !== null}
        event={editing}
        onOpenChange={(open) => {
          if (!open) setEditEventId(null)
        }}
        onChanged={refetch}
      />
    </div>
  )
}
