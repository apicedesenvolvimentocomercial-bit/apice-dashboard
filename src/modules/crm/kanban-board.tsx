'use client'

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { moveLeadAction } from '@/server/actions/lead-actions'
import { CreateLeadDialog } from './create-lead-dialog'
import { KanbanColumn } from './kanban-column'
import { LeadCard } from './lead-card'
import { LeadDrawer } from './lead-drawer'
import type { KanbanLead, KanbanStage } from './types'

type Props = {
  stages: KanbanStage[]
  clientId: string
}

export function KanbanBoard({ stages: initialStages, clientId }: Props) {
  const router = useRouter()
  const [stages, setStages] = useState<KanbanStage[]>(initialStages)
  const [activeLead, setActiveLead] = useState<KanbanLead | null>(null)
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createStageId, setCreateStageId] = useState<string>('')
  const [, startTransition] = useTransition()

  useEffect(() => {
    setStages(initialStages)
  }, [initialStages])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragStart({ active }: DragStartEvent) {
    const lead = stages.flatMap((s) => s.leads).find((l) => l.id === active.id)
    if (lead) setActiveLead(lead)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveLead(null)
    if (!over) return

    const leadId = active.id as string
    const newStageId = over.id as string
    const currentStage = stages.find((s) => s.leads.some((l) => l.id === leadId))
    if (!currentStage || currentStage.id === newStageId) return

    const lead = currentStage.leads.find((l) => l.id === leadId)!

    setStages((prev) =>
      prev.map((stage) => {
        if (stage.id === currentStage.id) {
          return { ...stage, leads: stage.leads.filter((l) => l.id !== leadId) }
        }
        if (stage.id === newStageId) {
          return { ...stage, leads: [...stage.leads, { ...lead, stageId: newStageId }] }
        }
        return stage
      })
    )

    startTransition(async () => {
      const result = await moveLeadAction(leadId, newStageId, clientId)
      if (!result.success) {
        toast.error('Erro ao mover lead')
        router.refresh()
      }
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
        const newLead: KanbanLead = {
          id: lead.id,
          name: lead.name,
          phone: null,
          source: 'OTHER',
          procedureInterest: null,
          tags: [],
          createdAt: new Date(),
          stageId: lead.stageId,
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
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
