import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  value: string
  hint?: string
  delta?: number | null
  invertDelta?: boolean
  tone?: 'default' | 'warning' | 'critical' | 'good'
  children?: React.ReactNode
}

export function KpiCard({
  label,
  value,
  hint,
  delta,
  invertDelta = false,
  tone = 'default',
  children,
}: Props) {
  const toneClass: Record<NonNullable<Props['tone']>, string> = {
    default: '',
    warning: 'border-amber-300/60',
    critical: 'border-rose-300/60',
    good: 'border-emerald-300/60',
  }

  const renderDelta = () => {
    if (delta == null) return null
    const isUp = delta > 0
    const isFlat = Math.abs(delta) < 0.0001
    const positiveIsGood = !invertDelta
    const goodDirection = isUp ? positiveIsGood : !positiveIsGood
    const color = isFlat
      ? 'text-muted-foreground'
      : goodDirection
        ? 'text-emerald-600'
        : 'text-rose-600'
    const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight
    return (
      <span className={cn('inline-flex items-center gap-0.5 text-xs', color)}>
        <Icon className="h-3 w-3" />
        {(delta * 100).toFixed(1)}%
      </span>
    )
  }

  return (
    <Card className={cn(toneClass[tone])}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-bold leading-tight">{value}</p>
          {renderDelta()}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {children}
      </CardContent>
    </Card>
  )
}
