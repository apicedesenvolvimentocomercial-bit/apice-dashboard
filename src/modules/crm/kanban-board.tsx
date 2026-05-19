'use client'

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { moveLeadAction, reorderLeadAction } from '@/server/actions/lead-actions'
import { CreateLeadDialog } from './create-lead-dialog'
import { KanbanColumn } from './kanban-column'
import { LeadCard } from './lead-card'
import { LeadDrawer } from './lead-drawer'
import type { KanbanLead, KanbanStage } from './types'

type Props = {
  stages: KanbanStage[]
  clientId: string
}

// Posição fracionária entre dois vizinhos — abre gap de 1000 quando não há
// vizinho (suficiente pra muitas inserções antes de precisar rebalancear).
function positionBetween(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return 1000
  if (prev == null) return (next as number) - 1000
  if (next == null) return (prev as number) + 1000
  return (prev + next) / 2
}

export function KanbanBoard({ stages: initialStages, clientId }: Props) {
  const router = useRouter()
  const [stages, setStages] = useState<KanbanStage[]>(initialStages)
  const [activeLead, setActiveLead] = useState<KanbanLead | null>(null)
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createStageId, setCreateStageId] = useState<string>('')
  const [, startTransition] = useTransition()

  // Snapshot tirada no início do drag — usada para reverter caso o backend
  // falhe e para descobrir qual era a coluna original (cross-column vs
  // mesma coluna).
  const dragSnapshot = useRef<KanbanStage[] | null>(null)

  useEffect(() => {
    setStages(initialStages)
  }, [initialStages])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Descobre o stageId que contém o item (pode ser uma stage ou um lead).
  function findStageId(stagesState: KanbanStage[], id: string): string | null {
    if (stagesState.some((s) => s.id === id)) return id
    for (const s of stagesState) {
      if (s.leads.some((l) => l.id === id)) return s.id
    }
    return null
  }

  function handleDragStart({ active }: DragStartEvent) {
    const lead = stages.flatMap((s) => s.leads).find((l) => l.id === active.id)
    if (lead) {
      setActiveLead(lead)
      dragSnapshot.current = stages
    }
  }

  // Reflow fluido entre colunas: assim que o cursor entra noutra coluna, o
  // lead já é movido no estado local. Isso encaixa o card no SortableContext
  // destino, então useSortable anima as posições dos vizinhos enquanto o
  // usuário continua arrastando.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string
    if (activeId === overId) return

    setStages((prev) => {
      const activeStageId = findStageId(prev, activeId)
      const overStageId = findStageId(prev, overId)
      if (!activeStageId || !overStageId) return prev
      // Mesma coluna: reorder visual fica a cargo do useSortable; o estado
      // só atualiza no dragEnd.
      if (activeStageId === overStageId) return prev

      const activeStage = prev.find((s) => s.id === activeStageId)
      const overStage = prev.find((s) => s.id === overStageId)
      if (!activeStage || !overStage) return prev

      const movingLead = activeStage.leads.find((l) => l.id === activeId)
      if (!movingLead) return prev

      // Insertion index no destino — sobre um card, insere antes dele;
      // sobre a área da coluna, anexa ao final.
      let insertIdx = overStage.leads.length
      if (overId !== overStageId) {
        const idx = overStage.leads.findIndex((l) => l.id === overId)
        if (idx >= 0) insertIdx = idx
      }

      return prev.map((s) => {
        if (s.id === activeStageId) {
          return { ...s, leads: s.leads.filter((l) => l.id !== activeId) }
        }
        if (s.id === overStageId) {
          const newLeads = [...s.leads]
          newLeads.splice(insertIdx, 0, { ...movingLead, stageId: overStageId })
          return { ...s, leads: newLeads }
        }
        return s
      })
    })
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveLead(null)
    const snapshot = dragSnapshot.current
    dragSnapshot.current = null
    if (!over || !snapshot) return

    const leadId = active.id as string
    const overId = over.id as string

    // Após o onDragOver, o lead já está na coluna destino. A mesma-coluna
    // ainda precisa do arrayMove final aqui, baseado em quem ficou sob o
    // cursor (useSortable só anima visualmente, não muda o array).
    const destStage = stages.find((s) => s.leads.some((l) => l.id === leadId))
    if (!destStage) return

    let finalLeads = destStage.leads
    const overIsCard = !stages.some((s) => s.id === overId) && overId !== leadId
    if (overIsCard) {
      const oldIdx = destStage.leads.findIndex((l) => l.id === leadId)
      const overIdx = destStage.leads.findIndex((l) => l.id === overId)
      if (oldIdx >= 0 && overIdx >= 0 && oldIdx !== overIdx) {
        finalLeads = arrayMove(destStage.leads, oldIdx, overIdx)
      }
    }

    const finalIdx = finalLeads.findIndex((l) => l.id === leadId)
    if (finalIdx < 0) return

    const prevLead = finalIdx > 0 ? finalLeads[finalIdx - 1] : null
    const nextLead = finalIdx < finalLeads.length - 1 ? finalLeads[finalIdx + 1] : null
    const newPosition = positionBetween(prevLead?.position ?? null, nextLead?.position ?? null)

    setStages((prev) =>
      prev.map((s) =>
        s.id === destStage.id
          ? {
              ...s,
              leads: finalLeads.map((l) => (l.id === leadId ? { ...l, position: newPosition } : l)),
            }
          : s
      )
    )

    const originalStage = snapshot.find((s) => s.leads.some((l) => l.id === leadId))
    const movingColumns = originalStage?.id !== destStage.id

    if (movingColumns) {
      persistMove(leadId, destStage.id, newPosition, snapshot)
    } else {
      // No-op se o card não mudou de posição numérica (mesma coluna, sem
      // hover sobre outro card).
      const originalPos = originalStage?.leads.find((l) => l.id === leadId)?.position
      if (originalPos === newPosition) return
      persistReorder(leadId, newPosition, snapshot)
    }
  }

  function persistMove(leadId: string, stageId: string, position: number, snapshot: KanbanStage[]) {
    startTransition(async () => {
      const result = await moveLeadAction(leadId, stageId, clientId, position)
      if (!result.success) {
        toast.error('Erro ao mover lead')
        setStages(snapshot)
        return
      }
      router.refresh()
    })
  }

  function persistReorder(leadId: string, position: number, snapshot: KanbanStage[]) {
    startTransition(async () => {
      const result = await reorderLeadAction(leadId, clientId, position)
      if (!result.success) {
        toast.error('Erro ao reordenar lead')
        setStages(snapshot)
        return
      }
      router.refresh()
    })
  }

  function openCreateDialog(stageId: string) {
    setCreateStageId(stageId)
    setCreateDialogOpen(true)
  }

  function handleLeadCreated(lead: { id: string; stageId: string; name: string }) {
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.id !== lead.stageId) return stage
        const lastPos = stage.leads.length ? Math.max(...stage.leads.map((l) => l.position)) : 0
        const newLead: KanbanLead = {
          id: lead.id,
          name: lead.name,
          phone: null,
          source: 'OTHER',
          procedureInterest: null,
          tags: [],
          createdAt: new Date(),
          stageId: lead.stageId,
          position: lastPos + 1000,
        }
        return { ...stage, leads: [...stage.leads, newLead] }
      })
    )
  }

  function handleLeadUpdated() {
    router.refresh()
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-[calc(100vh-12rem)] gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              onAddLead={() => openCreateDialog(stage.id)}
              onLeadClick={(leadId) => setDrawerLeadId(leadId)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeLead && <LeadCard lead={activeLead} onClick={() => {}} isDragOverlay />}
        </DragOverlay>
      </DndContext>

      <CreateLeadDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        clientId={clientId}
        stages={stages}
        defaultStageId={createStageId}
        onCreated={handleLeadCreated}
      />

      <LeadDrawer
        open={drawerLeadId !== null}
        leadId={drawerLeadId}
        clientId={clientId}
        stages={stages}
        onClose={() => setDrawerLeadId(null)}
        onLeadUpdated={handleLeadUpdated}
      />
    </>
  )
}
