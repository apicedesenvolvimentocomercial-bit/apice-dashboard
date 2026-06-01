'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'

import { cn } from '@/lib/utils'
import { LeadCard } from './lead-card'
import type { KanbanStage } from './types'

type Props = {
  stage: KanbanStage
  onAddLead: () => void
  onLeadClick: (leadId: string) => void
  /** Card a destacar (busca global, feat6). */
  highlightLeadId?: string | null
}

export function KanbanColumn({ stage, onAddLead, onLeadClick, highlightLeadId }: Props) {
  // O droppable da coluna captura drop em áreas vazias. Quando o usuário
  // solta sobre outro card, o SortableContext decide a posição relativa.
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stageId: stage.id } })
  const leadIds = stage.leads.map((l) => l.id)

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: stage.color ?? '#6b7280' }}
          />
          <span className="text-sm font-medium">{stage.name}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {stage.leads.length}
          </span>
        </div>
        {/* Etapas nativas de desfecho/processo não aceitam card criado direto:
            só Lead (e etapas livres) ganham o "+". Agendado/Compareceu exigem
            o fluxo de drag (que dispara agenda/KPI). */}
        {!stage.isWon &&
          !stage.isLost &&
          stage.nativeKey !== 'SCHEDULED' &&
          stage.nativeKey !== 'ATTENDED' && (
            <button
              onClick={onAddLead}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`Adicionar lead em ${stage.name}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
      </div>

      <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
        {/* Lista FLUIDA: altura do conteúdo (não estica). Se a coluna passar da
            altura visível, o board (pai) rola na vertical. */}
        <div ref={setNodeRef} className={cn('flex flex-col gap-2 rounded-lg bg-muted/30 p-2')}>
          {stage.leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={() => onLeadClick(lead.id)}
              highlight={highlightLeadId === lead.id}
            />
          ))}

          {stage.leads.length === 0 && !isOver && (
            <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
              Nenhum lead
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}
