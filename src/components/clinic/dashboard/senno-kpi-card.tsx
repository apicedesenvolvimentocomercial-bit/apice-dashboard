import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import { InfoHint } from '@/components/dashboard/info-hint'
import { cn } from '@/lib/utils'

import { formatPct1 } from './format'

type Props = {
  label: string
  value: string
  icon: React.ElementType
  /** Delta relativo vs período anterior (fração). null/undefined = sem pill. */
  delta?: number | null
  /** true quando SUBIR é ruim (custos): pill vermelha mesmo com seta p/ cima. */
  invertDelta?: boolean
  /** Linha final em muted ("vs. período anterior", "meta 38%"…). */
  sub?: string
  /** Explicação no "?" ao lado do label (preserva os popovers existentes). */
  info?: React.ReactNode
  /** Linhas extras (ex.: comparecimento/receita perdida no card No-show). */
  children?: React.ReactNode
}

/**
 * KPI card do redesign (handoff §5.1): ícone 14px + label 600, valor grande
 * tabular, pill de delta (verde bom / vermelho ruim — a COR segue a regra
 * bom/ruim, não a direção da seta) e sub em muted. Hover eleva a borda p/
 * dourado. Server-safe (sem estado).
 */
export function SennoKpiCard({
  label,
  value,
  icon: Icon,
  delta,
  invertDelta = false,
  sub,
  info,
  children,
}: Props) {
  const showDelta = delta != null && Math.abs(delta) >= 0.0005
  const isUp = (delta ?? 0) > 0
  const good = invertDelta ? !isUp : isUp
  const DeltaIcon = isUp ? ArrowUpRight : ArrowDownRight

  return (
    <div className="flex flex-col gap-[9px] rounded-[13px] border border-border bg-card p-[18px] pb-4 shadow-card transition-colors hover:border-primary/50">
      <div className="flex items-center gap-[7px]">
        <Icon className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" />
        <span className="text-[13.5px] font-semibold text-foreground">{label}</span>
        {info && <InfoHint label={label}>{info}</InfoHint>}
      </div>
      <div className="whitespace-nowrap text-[length:clamp(27px,0.6vw+21px,33px)] font-bold tabular-nums leading-none tracking-[-0.02em]">
        {value}
      </div>
      {(showDelta || sub) && (
        <div className="flex min-w-0 items-center gap-[7px] text-[11.5px]">
          {showDelta && (
            <span
              className={cn(
                'inline-flex flex-none items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-px font-semibold',
                good ? 'bg-ok-bg text-ok' : 'bg-destructive/[0.12] text-destructive'
              )}
            >
              <DeltaIcon className="h-[11px] w-[11px]" aria-hidden="true" />
              {formatPct1(Math.abs(delta ?? 0))}
            </span>
          )}
          {sub && (
            <span className="min-w-0 truncate whitespace-nowrap text-muted-foreground">{sub}</span>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
