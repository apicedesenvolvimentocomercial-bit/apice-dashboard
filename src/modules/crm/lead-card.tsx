'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarClock, Phone } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'
import { SOURCE_LABELS } from './types'
import type { KanbanLead } from './types'

type Props = {
  lead: KanbanLead
  onClick: () => void
  isDragOverlay?: boolean
  /** Destaque visual + scroll quando achado pela busca global (feat6). */
  highlight?: boolean
  /** M2: card de retenção não arrasta (os buckets são posicionados pelo cron). */
  dragDisabled?: boolean
}

export function LeadCard({
  lead,
  onClick,
  isDragOverlay = false,
  highlight = false,
  dragDisabled = false,
}: Props) {
  // useSortable engloba useDraggable e adiciona contexto de ordenação dentro
  // do SortableContext da coluna (drop sobre outro card = reorder relativo).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { lead },
    disabled: isDragOverlay || dragDisabled,
  })

  // Ao virar destaque (busca), rola o card até a viewport da coluna.
  const cardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [highlight])

  const style = { transform: CSS.Translate.toString(transform), transition }

  // Retorno esperado (reforma da retenção): só nos cards com paciente ligado.
  const dueAt = lead.patient?.nextReturnDueAt ? new Date(lead.patient.nextReturnDueAt) : null
  const isOverdue = dueAt ? dueAt.getTime() < Date.now() : false

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
        // Card de lead (handoff §7.3): bg-card, radius 11, sombra tingida;
        // hover sobe a borda p/ dourado e a sombra p/ elevação maior.
        'select-none rounded-[11px] border border-border bg-card px-3.5 py-[13px] shadow-card',
        'transition-[border-color,box-shadow] duration-150 hover:border-primary/50 hover:shadow-[0_4px_14px_-4px_hsl(var(--shadow)/calc(var(--shadow-a)*2.5))]',
        dragDisabled ? 'cursor-pointer' : 'cursor-grab',
        isDragging && 'opacity-30',
        isDragOverlay && 'rotate-1 cursor-grabbing opacity-100 shadow-overlay',
        highlight && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
      )}
    >
      <p className="truncate text-[13.5px] font-semibold leading-tight">{lead.name}</p>
      {lead.procedureInterest && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.procedureInterest}</p>
      )}
      <div className="mt-[11px] flex items-center justify-between gap-2">
        <span className="shrink-0 truncate rounded-full bg-secondary px-[9px] py-0.5 text-[11px] font-semibold text-secondary-foreground">
          {SOURCE_LABELS[lead.source]}
        </span>
        <span className="flex-none text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true, locale: ptBR })}
        </span>
      </div>
      {lead.phone && (
        <div className="mt-2.5 flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <Phone className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
          <span className="truncate">{lead.phone}</span>
        </div>
      )}
      {dueAt && (
        <div
          className={cn(
            'mt-2 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs',
            // Par texto+fundo semântico (design.md §1): atrasado = warn.
            isOverdue ? 'bg-warn-bg text-warn' : 'bg-muted text-muted-foreground'
          )}
        >
          <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {isOverdue ? 'Retorno atrasado ' : 'Retorno '}
            {formatDistanceToNow(dueAt, { addSuffix: true, locale: ptBR })}
          </span>
        </div>
      )}
    </div>
  )
}
