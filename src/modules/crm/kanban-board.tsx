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
import type { PipelineKind } from '@prisma/client'
import { Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { positionBetween } from '@/lib/dnd-position'
import { moveLeadAction, reorderLeadAction, regressLeadAction } from '@/server/actions/lead-actions'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { AddPatientCardDialog } from './add-patient-card-dialog'
import { CreateLeadDialog } from './create-lead-dialog'
import { KanbanColumn } from './kanban-column'
import { LeadCard } from './lead-card'
import { LeadDrawer } from './lead-drawer'
import { ScheduleLeadDialog, type ProcedureOption } from './schedule-lead-dialog'
import { StageEditorDialog } from './stage-editor-dialog'
import type { KanbanLead, KanbanStage } from './types'

type Props = {
  stages: KanbanStage[]
  clientId: string
  pipelineId: string
  /** Tipo do funil. RETENTION puxa pacientes já cadastrados; demais = leads. */
  pipelineKind: PipelineKind
  pipelineName: string
  /** Procedimentos da clínica p/ o dialog de Agendado (2a). */
  procedures: ProcedureOption[]
}

export function KanbanBoard({
  stages: initialStages,
  clientId,
  pipelineId,
  pipelineKind,
  pipelineName,
  procedures,
}: Props) {
  const router = useRouter()
  const [stages, setStages] = useState<KanbanStage[]>(initialStages)
  const [activeLead, setActiveLead] = useState<KanbanLead | null>(null)
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createStageId, setCreateStageId] = useState<string>('')
  const [stageEditorOpen, setStageEditorOpen] = useState(false)
  // Move para Agendado pendente de confirmação (dialog bloqueante 2a). Guarda o
  // snapshot p/ reverter o card se o usuário cancelar.
  const [pendingSchedule, setPendingSchedule] = useState<{
    leadId: string
    leadName: string
    stageId: string
    snapshot: KanbanStage[]
  } | null>(null)
  // Retrocesso pendente de confirmação (2d): desfaz efeitos ao confirmar.
  const [pendingRegress, setPendingRegress] = useState<{
    leadId: string
    leadName: string
    stageId: string
    position: number
    snapshot: KanbanStage[]
  } | null>(null)
  // Fechar antes do horário do agendamento pendente de confirmação (2c).
  const [pendingCloseEarly, setPendingCloseEarly] = useState<{
    leadId: string
    stageId: string
    position: number
    scheduledAt: Date
    snapshot: KanbanStage[]
  } | null>(null)
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

    // 2a — Mover para a etapa Agendado (nativeKey SCHEDULED) vindo de outra etapa
    // exige criar um agendamento ANTES de persistir. Abre o dialog bloqueante; o
    // move só é gravado se o agendamento for criado (via scheduleLeadAction).
    if (
      movingColumns &&
      destStage.nativeKey === 'SCHEDULED' &&
      originalStage?.nativeKey !== 'SCHEDULED'
    ) {
      const movedLead = destStage.leads.find((l) => l.id === leadId)
      setPendingSchedule({
        leadId,
        leadName: movedLead?.name ?? 'Lead',
        stageId: destStage.id,
        snapshot,
      })
      return
    }

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

  function persistMove(
    leadId: string,
    stageId: string,
    position: number,
    snapshot: KanbanStage[],
    force?: boolean
  ) {
    const leadName = snapshot.flatMap((s) => s.leads).find((l) => l.id === leadId)?.name ?? 'Lead'
    startTransition(async () => {
      const result = await moveLeadAction(leadId, stageId, clientId, position, force)
      if (!result.success) {
        toast.error(result.error.message)
        setStages(snapshot)
        return
      }
      const data = result.data
      if (data.status === 'needs-appointment') {
        toast.error('Agende o cliente (mova para Agendado) antes desta etapa.')
        setStages(snapshot)
        return
      }
      if (data.status === 'confirm-regress') {
        // Mantém o card já na etapa destino visualmente; pede confirmação.
        setPendingRegress({ leadId, leadName, stageId, position, snapshot })
        return
      }
      if (data.status === 'confirm-close-early') {
        setPendingCloseEarly({
          leadId,
          stageId,
          position,
          scheduledAt: new Date(data.scheduledAt),
          snapshot,
        })
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
      <div className="flex shrink-0 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStageEditorOpen(true)}
          aria-label="Editar etapas do funil"
        >
          <Pencil className="mr-2 h-4 w-4" />
          Editar etapas
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* min-h-0 + flex-1: a board toma a altura restante e rola só na
            horizontal; a rolagem vertical fica dentro de cada coluna. */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
          {stages.length === 0 ? (
            <div className="flex w-full items-center justify-center rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
              Nenhuma etapa configurada. Use “Editar etapas” para criar o funil.
            </div>
          ) : (
            stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                onAddLead={() => openCreateDialog(stage.id)}
                onLeadClick={(leadId) => setDrawerLeadId(leadId)}
              />
            ))
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeLead && <LeadCard lead={activeLead} onClick={() => {}} isDragOverlay />}
        </DragOverlay>
      </DndContext>

      {pipelineKind === 'RETENTION' ? (
        <AddPatientCardDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          clientId={clientId}
          defaultStageId={createStageId}
          onCreated={handleLeadCreated}
        />
      ) : (
        <CreateLeadDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          clientId={clientId}
          stages={stages}
          defaultStageId={createStageId}
          onCreated={handleLeadCreated}
        />
      )}

      <StageEditorDialog
        open={stageEditorOpen}
        onOpenChange={setStageEditorOpen}
        clientId={clientId}
        pipelineId={pipelineId}
        pipelineKind={pipelineKind}
        pipelineName={pipelineName}
        stages={stages}
      />

      <ScheduleLeadDialog
        open={pendingSchedule !== null}
        onOpenChange={(o) => {
          if (!o) setPendingSchedule(null)
        }}
        clientId={clientId}
        leadId={pendingSchedule?.leadId ?? null}
        leadName={pendingSchedule?.leadName ?? ''}
        stageId={pendingSchedule?.stageId ?? ''}
        procedures={procedures}
        onScheduled={() => {
          setPendingSchedule(null)
          router.refresh()
        }}
        onCancel={() => {
          // Reverte o card para a etapa de origem.
          if (pendingSchedule) setStages(pendingSchedule.snapshot)
          setPendingSchedule(null)
        }}
      />

      {/* 2d — Confirmação de retrocesso: desfaz os efeitos já aplicados. */}
      <AlertDialog
        open={pendingRegress !== null}
        onOpenChange={(o) => {
          if (!o && pendingRegress) {
            setStages(pendingRegress.snapshot)
            setPendingRegress(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retroceder card?</AlertDialogTitle>
            <AlertDialogDescription>
              Mover {pendingRegress?.leadName ?? 'este card'} para uma etapa anterior vai desfazer
              os efeitos já aplicados (agendamento, comparecimento e baixa financeira, conforme o
              caso). Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (pendingRegress) setStages(pendingRegress.snapshot)
                setPendingRegress(null)
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingRegress) return
                const p = pendingRegress
                setPendingRegress(null)
                startTransition(async () => {
                  const res = await regressLeadAction(p.leadId, p.stageId, clientId, p.position)
                  if (!res.success) {
                    toast.error(res.error.message)
                    setStages(p.snapshot)
                    return
                  }
                  toast.success('Card retrocedido — efeitos desfeitos.')
                  router.refresh()
                })
              }}
            >
              Sim, retroceder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 2c — Confirmação de fechar antes do horário do agendamento. */}
      <AlertDialog
        open={pendingCloseEarly !== null}
        onOpenChange={(o) => {
          if (!o && pendingCloseEarly) {
            setStages(pendingCloseEarly.snapshot)
            setPendingCloseEarly(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar antes do horário?</AlertDialogTitle>
            <AlertDialogDescription>
              O agendamento deste cliente ainda não ocorreu
              {pendingCloseEarly
                ? ` (marcado para ${pendingCloseEarly.scheduledAt.toLocaleString('pt-BR')})`
                : ''}
              . Fechar agora marcará como comparecido e dará baixa financeira. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (pendingCloseEarly) setStages(pendingCloseEarly.snapshot)
                setPendingCloseEarly(null)
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingCloseEarly) return
                const p = pendingCloseEarly
                setPendingCloseEarly(null)
                persistMove(p.leadId, p.stageId, p.position, p.snapshot, true)
              }}
            >
              Sim, fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
