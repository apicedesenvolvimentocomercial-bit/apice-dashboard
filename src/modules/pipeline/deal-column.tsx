'use client'

import { useDroppable } from '@dnd-kit/core'

import { cn } from '@/lib/utils'
import { DealCard } from './deal-card'
import type { PipelineColumn } from './types'

type Props = {
  column: PipelineColumn
  onDealClick: (dealId: string) => void
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)
}

export function DealColumn({ column, onDealClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage })

  const totalValue = column.deals.reduce((acc, d) => acc + (d.value ? Number(d.value) : 0), 0)

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: column.color }} />
          <span className="text-sm font-medium">{column.label}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {column.deals.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="text-xs font-medium text-muted-foreground">{formatBRL(totalValue)}</span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-48 flex-col gap-2 overflow-y-auto rounded-lg p-2 transition-colors',
          'bg-muted/30',
          isOver && 'bg-primary/10 ring-2 ring-primary/30'
        )}
      >
        {column.deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} onClick={() => onDealClick(deal.id)} />
        ))}
        {column.deals.length === 0 && !isOver && (
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
            Nenhuma negociação
          </div>
        )}
      </div>
    </div>
  )
}
