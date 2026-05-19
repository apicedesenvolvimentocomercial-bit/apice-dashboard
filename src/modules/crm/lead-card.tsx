'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Phone } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { SOURCE_LABELS } from './types'
import type { KanbanLead } from './types'

type Props = {
  lead: KanbanLead
  onClick: () => void
  isDragOverlay?: boolean
}

export function LeadCard({ lead, onClick, isDragOverlay = false }: Props) {
  // useSortable engloba useDraggable e adiciona contexto de ordenação dentro
  // do SortableContext da coluna (drop sobre outro card = reorder relativo).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { lead },
    disabled: isDragOverlay,
  })

  const style = { transform: CSS.Translate.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onClick()
      }}
      className={cn(
        'cursor-grab select-none rounded-lg border bg-background p-3',
        'transition-all hover:shadow-sm',
        isDragging && 'opacity-30',
        isDragOverlay && 'rotate-1 cursor-grabbing opacity-100 shadow-xl'
      )}
    >
      <p className="truncate text-sm font-medium leading-tight">{lead.name}</p>
      {lead.procedureInterest && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.procedureInterest}</p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-xs">
          {SOURCE_LABELS[lead.source]}
        </Badge>
        <span className="truncate text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true, locale: ptBR })}
        </span>
      </div>
      {lead.phone && (
        <div className="mt-1.5 flex items-center gap-1">
          <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{lead.phone}</span>
        </div>
      )}
    </div>
  )
}
