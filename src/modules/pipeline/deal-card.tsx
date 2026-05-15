'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Building2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { PipelineDealView } from './types'

type Props = {
  deal: PipelineDealView
  onClick?: () => void
  isDragOverlay?: boolean
}

function formatBRL(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)
}

export function DealCard({ deal, onClick, isDragOverlay = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  })

  const style = { transform: CSS.Translate.toString(transform) }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onClick?.()
      }}
      className={cn(
        'cursor-grab select-none rounded-lg border bg-background p-3',
        'transition-all hover:shadow-sm',
        isDragging && 'opacity-30',
        isDragOverlay && 'rotate-1 cursor-grabbing opacity-100 shadow-xl'
      )}
    >
      <div className="flex items-start gap-2">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{deal.client.name}</p>
          {(deal.client.city || deal.client.state) && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[deal.client.city, deal.client.state].filter(Boolean).join(' / ')}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{formatBRL(deal.value)}</span>
        <span className="truncate text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true, locale: ptBR })}
        </span>
      </div>
      {deal.probability != null && (
        <div className="mt-1 text-xs text-muted-foreground">{deal.probability}% prob.</div>
      )}
      {deal.stage === 'LOST' && deal.lostReason && (
        <div className="mt-1 truncate text-xs text-destructive">{deal.lostReason}</div>
      )}
    </div>
  )
}
