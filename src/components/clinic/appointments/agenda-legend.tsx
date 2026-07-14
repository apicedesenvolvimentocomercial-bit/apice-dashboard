import type { ClinicSchedule } from '@/modules/appointments/types'

const ABBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados']

type Props = {
  workdays: number[]
  holidays: ClinicSchedule['holidays']
  /** Texto do fechado muda por visão (§9): Semana "Fechado: Dom" (abreviado)
   * vs Mês "Fechado: domingos" (plural) — não normalizar. */
  variant: 'semana' | 'mes'
}

/**
 * Legenda Hoje/Fechado (agenda-handoff §9) — só nas visões Semana e Mês. A
 * hachura do swatch é PROPOSITALMENTE diferente da hachura real da célula
 * (0.28/3px vs 0.10/6px). Feriados (função existente) entram como item extra
 * quando configurados.
 */
export function AgendaLegend({ workdays, holidays, variant }: Props) {
  const closedDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !workdays.includes(d))
  const closedLabel =
    variant === 'mes'
      ? closedDays.map((d) => PLURAL[d]).join(', ')
      : closedDays.map((d) => ABBR[d]).join(', ')

  return (
    <div className="flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-[7px]">
        <span
          className="h-3.5 w-3.5 rounded border border-primary/40 bg-primary/[0.18]"
          aria-hidden="true"
        />
        Hoje
      </span>
      {closedDays.length > 0 && (
        <span className="inline-flex items-center gap-[7px]">
          <span
            className="h-3.5 w-3.5 rounded border border-border"
            style={{
              background:
                'repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/0.28) 0 3px, transparent 3px 6px)',
            }}
            aria-hidden="true"
          />
          Fechado: {closedLabel}
        </span>
      )}
      {holidays.length > 0 && (
        <>
          <span className="inline-flex items-center gap-[7px]">
            <span
              className="h-3.5 w-3.5 rounded border border-primary/25 bg-primary/[0.12]"
              aria-hidden="true"
            />
            Feriado
          </span>
          {holidays.map((h) => (
            <span key={h.id} className="inline-flex items-center gap-1">
              <span className="font-medium">{h.date}</span> — {h.name}
            </span>
          ))}
        </>
      )}
    </div>
  )
}
