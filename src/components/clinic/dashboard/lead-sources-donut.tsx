'use client'

import { Users } from 'lucide-react'
import { useState } from 'react'

export type LeadSourceItem = { label: string; count: number }

// Escala de dourado do escuro → claro (handoff §8.2): valores FIXOS de série
// de dados (não tokens), atribuídos por ordem decrescente de contagem.
const GOLD_SCALE = [
  'hsl(33 70% 31%)',
  'hsl(37 66% 42%)',
  'hsl(41 63% 52%)',
  'hsl(43 64% 61%)',
  'hsl(45 62% 70%)',
  'hsl(47 56% 79%)',
  'hsl(49 50% 88%)',
]

const OUTER = 70
const INNER = 41
const CX = 70
const CY = 70

function polar(r: number, deg: number): string {
  const t = ((deg - 90) * Math.PI) / 180
  return `${(CX + r * Math.cos(t)).toFixed(2)} ${(CY + r * Math.sin(t)).toFixed(2)}`
}

/** Setor anelar (donut) entre os ângulos a0→a1, sentido horário do topo. */
function slicePath(a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0
  return [
    `M ${polar(OUTER, a0)}`,
    `A ${OUTER} ${OUTER} 0 ${large} 1 ${polar(OUTER, a1)}`,
    `L ${polar(INNER, a1)}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${polar(INNER, a0)}`,
    'Z',
  ].join(' ')
}

/**
 * Donut "Origem dos leads" (handoff §8): SVG puro (setores anelares), hover
 * apaga as outras fatias p/ 0.28 e o miolo troca p/ contagem/nome/% da fatia.
 * A legenda espelha o hover.
 */
export function LeadSourcesDonut({ items }: { items: LeadSourceItem[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const sorted = [...items].filter((s) => s.count > 0).sort((a, b) => b.count - a.count)
  const total = sorted.reduce((acc, s) => acc + s.count, 0)

  if (total === 0) {
    return (
      <div className="flex h-full flex-col rounded-[13px] border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/50">
        <h2 className="m-0 text-[length:clamp(16px,0.22vw+13.2px,17.5px)] font-semibold">
          Origem dos leads
        </h2>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <Users
            className="h-[34px] w-[34px] text-muted-foreground"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium">Nenhum lead no período</p>
          <p className="-mt-1 text-xs text-muted-foreground">
            Os leads criados aparecem aqui por origem.
          </p>
        </div>
      </div>
    )
  }

  const withMeta = sorted.map((s, idx) => ({
    ...s,
    fill: GOLD_SCALE[Math.min(idx, GOLD_SCALE.length - 1)],
    pct: Math.round((s.count / total) * 100),
  }))

  const centerBig = hover != null ? withMeta[hover].count : total
  const centerSmall = hover != null ? withMeta[hover].label : 'leads'
  const centerSub = hover != null ? `${withMeta[hover].pct}%` : null

  let acc = 0

  return (
    <div className="flex h-full flex-col rounded-[13px] border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/50">
      <h2 className="m-0 text-[length:clamp(16px,0.22vw+13.2px,17.5px)] font-semibold">
        Origem dos leads
      </h2>
      <div className="mt-4 flex flex-1 items-center gap-[22px]">
        <div className="relative h-[140px] w-[140px] flex-none">
          <svg viewBox="0 0 140 140" width={140} height={140} className="block">
            {withMeta.length === 1 ? (
              // Fatia única (100%): arco não desenha círculo completo — usa anel.
              <circle
                cx={CX}
                cy={CY}
                r={(OUTER + INNER) / 2}
                fill="none"
                stroke={withMeta[0].fill}
                strokeWidth={OUTER - INNER}
                onMouseEnter={() => setHover(0)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer"
              />
            ) : (
              withMeta.map((s, idx) => {
                const a0 = (acc / total) * 360
                acc += s.count
                const a1 = (acc / total) * 360
                const dim = hover != null && hover !== idx
                return (
                  <path
                    key={s.label}
                    d={slicePath(a0, a1)}
                    fill={s.fill}
                    opacity={dim ? 0.28 : 1}
                    onMouseEnter={() => setHover(idx)}
                    onMouseLeave={() => setHover(null)}
                    className="cursor-pointer transition-opacity duration-160"
                  />
                )
              })
            )}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-px">
            <span className="text-[22px] font-bold tabular-nums leading-[1.05] tracking-[-0.02em] text-foreground">
              {centerBig}
            </span>
            <span className="max-w-[86px] text-center text-[10.5px] leading-[1.15] text-muted-foreground">
              {centerSmall}
            </span>
            {centerSub && (
              <span className="mt-px text-[10px] font-semibold tabular-nums text-primary-text">
                {centerSub}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
          {withMeta.map((s, idx) => (
            <div
              key={s.label}
              className="flex items-center gap-[9px] transition-opacity duration-160"
              style={{ opacity: hover != null && hover !== idx ? 0.4 : 1 }}
              onMouseEnter={() => setHover(idx)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className="h-2.5 w-2.5 flex-none rounded-[3px]"
                style={{ background: s.fill }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                {s.label}
              </span>
              <span className="text-[12.5px] font-semibold tabular-nums text-muted-foreground">
                {s.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
