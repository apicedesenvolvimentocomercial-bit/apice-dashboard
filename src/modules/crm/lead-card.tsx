'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Phone } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { SOURCE_LABELS } from './types'
import type { KanbanLead } from './types'

type Props = {
  lead: KanbanLead
  onClick: () => void
  isDragOverlay?: boolean
  /** Destaque visual + scroll quando achado pela busca global (feat6). */
  highlight?: boolean
}

export function LeadCard({ lead, onClick, isDragOverlay = false, highlight = false }: Props) {
  // useSortable engloba useDraggable e adiciona contexto de ordenação dentro
  // do SortableContext da coluna (drop sobre outro card = reorder relativo).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { lead },
    disabled: isDragOverlay,
  })

  // Ao virar destaque (busca), rola o card até a viewport da coluna.
  const cardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [highlight])

  const style = { transform: CSS.Translate.toString(transform), transition }

  return (
    // dnd-kit injeta role/tabIndex/handlers de teclado via {...attributes}/{...listeners}
    // (Space/Enter = pegar/soltar o card). Um onKeyDown próprio p/ "abrir" conflitaria com o
    // drag por teclado; o clique é uma affordance de mouse complementar.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={(node) => {
        setNodeRef(node)
        cardRef.current = node
      }}
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
        isDragOverlay && 'rotate-1 cursor-grabbing opacity-100 shadow-xl',
        highlight && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
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
