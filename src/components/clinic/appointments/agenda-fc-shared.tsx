import type { DayHeaderContentArg } from '@fullcalendar/core'

/**
 * Miolo compartilhado entre os dois calendários da Agenda redesenhada
 * (Agendamentos e Calendário pessoal): mapa visão→FullCalendar, formatos de
 * título do período, cabeçalhos de dia custom e a geração dos background
 * events de dia fechado (hachura) restrita ao período visível — dias "fora do
 * mês" nunca recebem hachura (agenda-handoff §7.2/§12).
 */
export type AgendaView = 'dia' | 'semana' | 'mes' | 'lista'

export type AgendaCalendarApi = {
  prev: () => void
  next: () => void
  today: () => void
}

export type AgendaDatesInfo = {
  title: string
  viewType: string
  /** Janela visível (inclui dias de fora do mês na visão Mês). */
  start: Date
  end: Date
  /** Período "corrente" da visão (1º dia do mês / da semana / o dia). */
  currentStart: Date
  currentEnd: Date
}

/** Lista usa a MESMA janela de semana do FullCalendar (navegação única). */
export const AGENDA_FC_VIEW: Record<AgendaView, string> = {
  dia: 'timeGridDay',
  semana: 'timeGridWeek',
  mes: 'dayGridMonth',
  lista: 'timeGridWeek',
}

/** Títulos do período por visão (§4.2): "junho de 2026" · "qui. 25 de jun.
 * de 2026" · "21 – 27 de jun. de 2026". */
export const AGENDA_FC_VIEWS_CONFIG = {
  timeGridWeek: {
    titleFormat: { year: 'numeric', month: 'short', day: 'numeric' } as const,
  },
  timeGridDay: {
    titleFormat: {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      omitCommas: true,
    } as const,
  },
  dayGridMonth: {
    titleFormat: { year: 'numeric', month: 'long' } as const,
  },
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Chave local "YYYY-MM-DD" (datas do FullCalendar são wall-clock locais). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** "YYYY-MM-DDTHH:mm:ss" local — p/ comparar com strings wall-clock SP. */
export function toLocalISO(d: Date): string {
  return `${localDateKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

const MAX_CLOSED_DAYS = 45 // teto de segurança (mês com 6 semanas = 42 dias)

/**
 * Background events de dia FECHADO (hachura via classe `fc-bg-closed`) só
 * dentro do período corrente da visão — assim os dias de fora do mês ficam
 * sem hachura, como no protótipo.
 */
export function buildClosedDayBgEvents(
  currentStart: Date,
  currentEnd: Date,
  workdays: number[]
): object[] {
  const out: object[] = []
  const d = new Date(currentStart)
  for (let i = 0; i < MAX_CLOSED_DAYS && d < currentEnd; i++) {
    if (!workdays.includes(d.getDay())) {
      const key = localDateKey(d)
      out.push({
        id: `closed-${key}`,
        start: key,
        allDay: true,
        display: 'background',
        classNames: ['fc-bg-closed'],
        extendedProps: { isClosed: true },
      })
    }
    d.setDate(d.getDate() + 1)
  }
  return out
}

const fmtWeekdayShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const fmtWeekdayLong = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })
const fmtDayMonthLong = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' })

/**
 * Cabeçalhos de dia por visão (§5.1/§6.1/§7.1): Mês = "dom."; Semana =
 * "seg. 22/06" (+ badge "Fechado"); Dia = "quinta-feira, 25 de junho" +
 * contagem ("5 agendamentos").
 */
export function agendaDayHeaderContent(opts: {
  workdays: number[]
  dayCounts: Record<string, number>
  countNoun: string
}) {
  return (arg: DayHeaderContentArg) => {
    if (arg.view.type === 'dayGridMonth') {
      // No dayGrid o `arg.date` do cabeçalho é um exemplar UTC-based — formatar
      // com Intl local desloca 1 dia em UTC-3. O `arg.text` já vem localizado
      // pelo próprio FC ("dom.", "seg.", …).
      return <span>{arg.text}</span>
    }
    if (arg.view.type === 'timeGridDay') {
      const count = opts.dayCounts[localDateKey(arg.date)] ?? 0
      return (
        <span className="senno-day-head">
          <span>
            {fmtWeekdayLong.format(arg.date)}, {fmtDayMonthLong.format(arg.date)}
          </span>
          <span className="senno-day-head-count">
            {count} {count === 1 ? opts.countNoun : `${opts.countNoun}s`}
          </span>
        </span>
      )
    }
    // Semana
    const closed = !opts.workdays.includes(arg.date.getDay())
    return (
      <span className="flex flex-col items-center">
        <span>
          {fmtWeekdayShort.format(arg.date)} {pad2(arg.date.getDate())}/
          {pad2(arg.date.getMonth() + 1)}
        </span>
        {closed && <span className="senno-closed-badge">Fechado</span>}
      </span>
    )
  }
}

/** Hachura no cabeçalho do dia fechado (Semana/Dia; no Mês o cabeçalho é o
 * nome do dia da semana — a hachura fica só nas células). */
export function agendaDayHeaderClassNames(workdays: number[]) {
  return (arg: DayHeaderContentArg) =>
    arg.view.type !== 'dayGridMonth' && !workdays.includes(arg.date.getDay())
      ? ['senno-closed-head']
      : []
}
