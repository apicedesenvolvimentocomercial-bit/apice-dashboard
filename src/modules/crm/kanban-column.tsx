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
  /** "Carregar mais" (M1): busca a próxima página da coluna. */
  onLoadMore: () => void
  loadingMore?: boolean
  /** M2: retenção é board SOMENTE-LEITURA (o cron posiciona os buckets). */
  dragDisabled?: boolean
}

export function KanbanColumn({
  stage,
  onAddLead,
  onLeadClick,
  highlightLeadId,
  onLoadMore,
  loadingMore,
  dragDisabled,
}: Props) {
  // O droppable da coluna captura drop em áreas vazias. Quando o usuário
  // solta sobre outro card, o SortableContext decide a posição relativa.
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stageId: stage.id } })
  const leadIds = stage.leads.map((l) => l.id)

  return (
    <div className="flex w-[280px] flex-none flex-col gap-2.5">
      {/* Cabeçalho da coluna (handoff §7.2): dot de categoria + nome + pill. */}
      <div className="flex min-h-[30px] items-center gap-[9px] px-1 py-0.5">
        <div
          className="h-[9px] w-[9px] flex-none rounded-full"
          style={{ backgroundColor: stage.color ?? 'hsl(var(--muted-foreground))' }}
          aria-hidden="true"
        />
        <span className="truncate text-[13.5px] font-semibold">{stage.name}</span>
        <span className="min-w-[20px] rounded-full bg-muted px-[7px] py-px text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
          {/* Total REAL da coluna; com página parcial vira "carregados de total". */}
          {stage.totalLeads > stage.leads.length
            ? `${stage.leads.length} de ${stage.totalLeads}`
            : stage.totalLeads}
        </span>
        <span className="flex-1" />
        {/* Etapas nativas de desfecho/processo não aceitam card criado direto:
            só Lead (e etapas livres) ganham o "+". Agendado/Compareceu exigem
            o fluxo de drag (que dispara agenda/KPI). */}
        {!stage.isWon &&
          !stage.isLost &&
          stage.nativeKey !== 'SCHEDULED' &&
          stage.nativeKey !== 'ATTENDED' && (
            <button
              onClick={onAddLead}
              title="Adicionar"
              aria-label={`Adicionar em ${stage.name}`}
              className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-[15px] w-[15px]" />
            </button>
          )}
      </div>

      <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
        {/* Corpo da coluna — container fluido de cards (handoff §7.2): altura
            do conteúdo (não estica). Se passar da altura visível, o board
            (pai) rola na vertical. */}
        <div
          ref={setNodeRef}
          className={cn(
            'flex flex-col gap-2.5 rounded-[13px] border border-border bg-muted/[0.45] p-2.5'
          )}
        >
          {stage.leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={() => onLeadClick(lead.id)}
              highlight={highlightLeadId === lead.id}
              dragDisabled={dragDisabled}
            />
          ))}

          {/* Empty simples (handoff §7.4) — a ação de adicionar já está no
              cabeçalho da coluna, sem redundância. */}
          {stage.leads.length === 0 && !isOver && (
            <div className="flex min-h-[148px] items-center justify-center rounded-[11px] border-[1.5px] border-dashed border-border bg-card/35 text-[12.5px] text-muted-foreground">
              Nenhum lead
            </div>
          )}

          {stage.totalLeads > stage.leads.length && (
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="rounded-[9px] border border-dashed border-border py-1.5 text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {loadingMore
                ? 'Carregando…'
                : `Carregar mais (${stage.totalLeads - stage.leads.length} restantes)`}
            </button>
          )}
        </div>
      </SortableContext>
    </div>
  )
}
