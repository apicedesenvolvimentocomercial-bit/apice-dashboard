import { Calendar } from 'lucide-react'
import Link from 'next/link'

import { APP_TIMEZONE, spDayKey } from '@/lib/date'

export type UpcomingAppointment = {
  id: string
  scheduledAt: Date
  status: string
  patientName: string
  procedureName: string
}

const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: APP_TIMEZONE,
})
const dayFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: APP_TIMEZONE,
})

/**
 * Card "Próximos agendamentos" (handoff §10): 5 linhas (hora · paciente ·
 * procedimento · pill de status). CONFIRMED = confirmado (ok); SCHEDULED =
 * pendente (warn). Agendamento fora de hoje mostra a data sob a hora.
 * Server-safe (sem estado).
 */
export function UpcomingAppointmentsCard({ items }: { items: UpcomingAppointment[] }) {
  const todayKey = spDayKey(new Date())

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[13px] border border-border bg-card shadow-card transition-colors hover:border-primary/50">
      <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
        <h2 className="m-0 text-[length:clamp(16px,0.22vw+13.2px,17.5px)] font-semibold">
          Próximos agendamentos
        </h2>
        <Link
          href="/appointments"
          className="text-xs font-semibold text-primary-text hover:underline"
        >
          Ver agenda
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <Calendar
            className="h-[34px] w-[34px] text-muted-foreground"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium">Nenhum agendamento por vir</p>
          <Link
            href="/appointments"
            className="mt-1 inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground hover:brightness-105"
          >
            Agendar paciente
          </Link>
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((a) => {
            const confirmed = a.status === 'CONFIRMED'
            const isToday = spDayKey(new Date(a.scheduledAt)) === todayKey
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 border-t border-border px-[18px] py-[11px]"
              >
                <div className="w-[42px] flex-none">
                  <div className="text-[12.5px] font-semibold tabular-nums text-foreground">
                    {timeFmt.format(new Date(a.scheduledAt))}
                  </div>
                  {!isToday && (
                    <div className="text-[10px] tabular-nums text-muted-foreground">
                      {dayFmt.format(new Date(a.scheduledAt))}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{a.patientName}</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">
                    {a.procedureName}
                  </div>
                </div>
                <span
                  className={`flex-none rounded-full px-[9px] py-0.5 text-[11px] font-semibold ${
                    confirmed ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn'
                  }`}
                >
                  {confirmed ? 'confirmado' : 'pendente'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
