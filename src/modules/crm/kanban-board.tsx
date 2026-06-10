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
import type { PipelineCategory, PipelineKind, StageNativeKey } from '@prisma/client'
import { Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { ClinicSchedule } from '@/modules/appointments/types'
import { isPositionExhausted, positionBetween } from '@/lib/dnd-position'
import {
  loadStageLeadsAction,
  moveLeadAction,
  rebalanceLeadAction,
  reorderLeadAction,
  regressLeadAction,
} from '@/server/actions/lead-actions'
import { RevenueDetailsDialog } from '@/modules/financial/revenue-details-dialog'
import type { RevenueDetails } from '@/modules/financial/types'
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
import { AttendLeadDialog } from './attend-lead-dialog'
import { CancelLeadDialog } from './cancel-lead-dialog'
import { CreateLeadDialog } from './create-lead-dialog'
import { ClientCard } from '@/components/clinic/client-card/client-card'
import { KanbanColumn } from './kanban-column'
import { LeadCard } from './lead-card'
import { RescheduleLeadDialog } from './reschedule-lead-dialog'
import { ScheduleLeadDialog, type ProcedureOption } from './schedule-lead-dialog'
import { StageEditorDialog } from './stage-editor-dialog'
import type { KanbanLead, KanbanStage, PipelineMoveTarget } from './types'

type Props = {
  stages: KanbanStage[]
  clientId: string
  pipelineId: string
  /** Tipo do funil. RETENTION puxa pacientes já cadastrados; demais = leads. */
  pipelineKind: PipelineKind
  /** Categoria semântica (LEAD/PATIENT/OTHER) — rege o fluxo de mover entre funis. */
  pipelineCategory: PipelineCategory
  pipelineName: string
  /** Todos os funis da clínica (leve) p/ o dialog "Mover para funil". */
  allPipelines: PipelineMoveTarget[]
  /** Procedimentos da clínica p/ o dialog de Agendado (2a). */
  procedures: ProcedureOption[]
  /** Expediente da clínica p/ as validações do dialog de Agendado (2a). */
  schedule: ClinicSchedule
  /** Card a destacar (busca global, feat6). Limpa sozinho após alguns segundos. */
  highlightLeadId?: string | null
  /** Card vindo da busca global que pode estar além da página carregada (M1):
   *  é injetado na coluna correspondente antes do destaque/scroll. */
  ensureLead?: KanbanLead | null
}

export function KanbanBoard({
  stages: initialStages,
  clientId,
  pipelineId,
  pipelineKind,
  pipelineCategory,
  pipelineName,
  allPipelines,
  procedures,
  schedule,
  highlightLeadId,
  ensureLead,
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
  // Move para Compareceu pendente (dialog bloqueante feat1): completa o cadastro
  // do paciente antes de persistir.
  const [pendingAttend, setPendingAttend] = useState<{
    leadId: string
    stageId: string
    defaults: { name: string; phone: string | null; email: string | null }
    snapshot: KanbanStage[]
  } | null>(null)
  // Move para Cancelado pendente (dialog bloqueante feat5): exige o motivo.
  // `wasAttended` = vinha de Compareceu → o dialog avisa que cancelar desfaz
  // o comparecimento/baixa já registrados.
  const [pendingCancel, setPendingCancel] = useState<{
    leadId: string
    leadName: string
    stageId: string
    position: number
    wasAttended: boolean
    snapshot: KanbanStage[]
  } | null>(null)
  // Retrocesso para Agendado pendente: dialog de remarcação (reusa o mesmo
  // agendamento, não cria outro).
  const [pendingReschedule, setPendingReschedule] = useState<{
    leadId: string
    leadName: string
    appointmentId: string
    stageId: string
    position: number
    snapshot: KanbanStage[]
  } | null>(null)
  // Fechar pendente de confirmação: avisa que dará baixa financeira (gera receita).
  const [pendingClose, setPendingClose] = useState<{
    leadId: string
    leadName: string
    stageId: string
    position: number
    snapshot: KanbanStage[]
  } | null>(null)
  // Retrocesso pendente de confirmação (2d): desfaz efeitos ao confirmar.
  // `toKey` = etapa destino do retrocesso (p/ mensagem específica de Agendado).
  const [pendingRegress, setPendingRegress] = useState<{
    leadId: string
    leadName: string
    stageId: string
    position: number
    toKey: StageNativeKey | null
    snapshot: KanbanStage[]
  } | null>(null)
  const [isPending, startTransition] = useTransition()
  // M1: colunas com página parcial — id da coluna carregando a próxima página.
  const [loadingMoreStageId, setLoadingMoreStageId] = useState<string | null>(null)

  // M2: retenção é board SOMENTE-LEITURA — os buckets são posicionados pelo
  // cron diário (mover à mão seria desfeito à noite); o card continua clicável.
  const dragDisabled = pipelineKind === 'RETENTION'

  // Snapshot tirada no início do drag — usada para reverter caso o backend
  // falhe e para descobrir qual era a coluna original (cross-column vs
  // mesma coluna).
  const dragSnapshot = useRef<KanbanStage[] | null>(null)

  // Cursor de paginação POR COLUNA (M1). Vive fora de `stages` de propósito: a
  // inserção do ensureLead (busca) e cards criados localmente entram no array,
  // mas o cursor precisa apontar p/ o fim da página CONTÍGUA carregada do
  // servidor — derivá-lo do último item do array pularia cards intermediários.
  const cursorByStage = useRef<Map<string, string | null>>(new Map())

  useEffect(() => {
    const cursors = new Map<string, string | null>()
    for (const s of initialStages) {
      cursors.set(s.id, s.leads.length > 0 ? s.leads[s.leads.length - 1].id : null)
    }
    cursorByStage.current = cursors
    setStages(initialStages)
  }, [initialStages])

  // Injeta o card achado pela busca quando ele está além da página carregada.
  useEffect(() => {
    if (!ensureLead) return
    setStages((prev) =>
      prev.map((s) => {
        if (s.id !== ensureLead.stageId) return s
        if (s.leads.some((l) => l.id === ensureLead.id)) return s
        const leads = [...s.leads, ensureLead].sort(
          (a, b) => a.position - b.position || a.id.localeCompare(b.id)
        )
        return { ...s, leads }
      })
    )
  }, [ensureLead])

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
    const fromKey = originalStage?.nativeKey
    const movedLead = destStage.leads.find((l) => l.id === leadId)

    // Mover para a etapa Agendado (nativeKey SCHEDULED):
    //  - card SEM agendamento → cria um (dialog de agendamento, 2a);
    //  - card COM agendamento (veio de Compareceu/Fechado/Cancelado) → RETROCESSO
    //    com remarcação: dialog mostra os dados do agendamento e REUSA o mesmo
    //    Appointment ao confirmar (não cria outro — evita duplicar na agenda).
    if (movingColumns && destStage.nativeKey === 'SCHEDULED' && fromKey !== 'SCHEDULED') {
      if (movedLead?.appointmentId) {
        setPendingReschedule({
          leadId,
          leadName: movedLead?.name ?? 'Lead',
          appointmentId: movedLead.appointmentId,
          stageId: destStage.id,
          position: newPosition,
          snapshot,
        })
      } else {
        setPendingSchedule({
          leadId,
          leadName: movedLead?.name ?? 'Lead',
          stageId: destStage.id,
          snapshot,
        })
      }
      return
    }

    // feat1 — Mover para Compareceu (ATTENDED) abre o dialog que completa o
    // cadastro do paciente. CLOSED→ATTENDED é retrocesso (rank menor) e segue o
    // fluxo de confirmação no servidor; não abre este dialog.
    if (
      movingColumns &&
      destStage.nativeKey === 'ATTENDED' &&
      fromKey !== 'ATTENDED' &&
      fromKey !== 'CLOSED'
    ) {
      setPendingAttend({
        leadId,
        stageId: destStage.id,
        defaults: {
          name: movedLead?.name ?? '',
          phone: movedLead?.phone ?? null,
          email: movedLead?.email ?? null,
        },
        snapshot,
      })
      return
    }

    // feat5 — Mover para Cancelado (NO_SHOW) exige motivo. CLOSED→NO_SHOW é
    // retrocesso; deixa cair no persistMove (confirm-regress).
    if (
      movingColumns &&
      destStage.nativeKey === 'NO_SHOW' &&
      fromKey !== 'NO_SHOW' &&
      fromKey !== 'CLOSED'
    ) {
      setPendingCancel({
        leadId,
        leadName: movedLead?.name ?? 'Lead',
        stageId: destStage.id,
        position: newPosition,
        wasAttended: fromKey === 'ATTENDED',
        snapshot,
      })
      return
    }

    // Fechar (CLOSED) dá baixa financeira (gera a receita do procedimento) — pede
    // confirmação antes. O bloqueio "passe por Compareceu" é validado no servidor.
    if (movingColumns && destStage.nativeKey === 'CLOSED' && fromKey !== 'CLOSED') {
      setPendingClose({
        leadId,
        leadName: movedLead?.name ?? 'Lead',
        stageId: destStage.id,
        position: newPosition,
        snapshot,
      })
      return
    }

    if (movingColumns) {
      // Cross-column com posição esgotada é raríssimo (coluna recém-recebida);
      // o move segue com a posição degenerada (ordem ambígua entre 2 cards) e
      // um reorder posterior dispara o rebalance.
      persistMove(leadId, destStage.id, newPosition, snapshot)
    } else {
      // Fase 4: bissecção esgotou a precisão do Float (≈50 inserções no mesmo
      // ponto) → renumera a coluna no servidor preservando a ordem visual.
      if (
        isPositionExhausted(prevLead?.position ?? null, nextLead?.position ?? null, newPosition)
      ) {
        startTransition(async () => {
          const res = await rebalanceLeadAction(
            leadId,
            clientId,
            destStage.id,
            nextLead?.id ?? null
          )
          if (!res.success) {
            toast.error(res.error.message)
            setStages(snapshot)
            return
          }
          router.refresh()
        })
        return
      }
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
    cancelReason?: string,
    revenueDetails?: RevenueDetails
  ) {
    const leadName = snapshot.flatMap((s) => s.leads).find((l) => l.id === leadId)?.name ?? 'Lead'
    startTransition(async () => {
      const result = await moveLeadAction(
        leadId,
        stageId,
        clientId,
        position,
        cancelReason,
        revenueDetails
      )
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
      if (data.status === 'needs-attendance') {
        toast.error('Mova para Compareceu antes de fechar.')
        setStages(snapshot)
        return
      }
      if (data.status === 'confirm-regress') {
        // Mantém o card já na etapa destino visualmente; pede confirmação.
        setPendingRegress({ leadId, leadName, stageId, position, toKey: data.toKey, snapshot })
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

  // M1: anexa a próxima página de cards à coluna (cursor = último carregado;
  // mesma ordem estável do SSR). Dedupe defensivo por id — um drag concorrente
  // pode ter trazido um card para a coluna entre as páginas.
  function loadMore(stageId: string) {
    const cursor = cursorByStage.current.get(stageId)
    if (!cursor || loadingMoreStageId) return
    setLoadingMoreStageId(stageId)
    loadStageLeadsAction(clientId, stageId, cursor).then((res) => {
      setLoadingMoreStageId(null)
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      const incoming = res.data.rows as unknown as KanbanLead[]
      if (incoming.length > 0) {
        cursorByStage.current.set(stageId, incoming[incoming.length - 1].id)
      }
      setStages((prev) =>
        prev.map((s) => {
          if (s.id !== stageId) return s
          const have = new Set(s.leads.map((l) => l.id))
          return { ...s, leads: [...s.leads, ...incoming.filter((l) => !have.has(l.id))] }
        })
      )
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
          email: null,
          source: 'OTHER',
          procedureInterest: null,
          tags: [],
          createdAt: new Date(),
          stageId: lead.stageId,
          position: lastPos + 1000,
          appointmentId: null,
          patient: null,
        }
        return { ...stage, leads: [...stage.leads, newLead], totalLeads: stage.totalLeads + 1 }
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
        id="kanban-dnd"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* `items-start`: as colunas têm altura FLUIDA (do tamanho do conteúdo),
            não esticam até o rodapé. O board ocupa a altura restante (min-h-0
            flex-1) e rola na horizontal; se uma coluna passar da altura visível,
            o board rola na vertical. */}
        <div className="flex min-h-0 flex-1 items-start gap-4 overflow-x-auto pb-2">
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
                highlightLeadId={highlightLeadId}
                onLoadMore={() => loadMore(stage.id)}
                loadingMore={loadingMoreStageId === stage.id}
                dragDisabled={dragDisabled}
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
          defaultStageId={createStageId}
          procedures={procedures}
          onCreated={handleLeadCreated}
        />
      )}

      <StageEditorDialog
        open={stageEditorOpen}
        onOpenChange={setStageEditorOpen}
        clientId={clientId}
        pipelineId={pipelineId}
        pipelineKind={pipelineKind}
        pipelineCategory={pipelineCategory}
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
        schedule={schedule}
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

      {/* Retrocesso p/ Agendado: remarca o MESMO agendamento (não duplica). */}
      <RescheduleLeadDialog
        open={pendingReschedule !== null}
        onOpenChange={(o) => {
          if (!o) setPendingReschedule(null)
        }}
        clientId={clientId}
        leadId={pendingReschedule?.leadId ?? null}
        appointmentId={pendingReschedule?.appointmentId ?? null}
        leadName={pendingReschedule?.leadName ?? ''}
        stageId={pendingReschedule?.stageId ?? ''}
        position={pendingReschedule?.position}
        procedures={procedures}
        schedule={schedule}
        onDone={() => {
          setPendingReschedule(null)
          router.refresh()
        }}
        onCancel={() => {
          if (pendingReschedule) setStages(pendingReschedule.snapshot)
          setPendingReschedule(null)
        }}
      />

      {/* feat1 — Compareceu: completa o cadastro do paciente antes de persistir. */}
      <AttendLeadDialog
        open={pendingAttend !== null}
        onOpenChange={(o) => {
          if (!o) setPendingAttend(null)
        }}
        clientId={clientId}
        leadId={pendingAttend?.leadId ?? null}
        stageId={pendingAttend?.stageId ?? ''}
        defaults={pendingAttend?.defaults ?? { name: '', phone: null, email: null }}
        onAttended={() => {
          setPendingAttend(null)
          router.refresh()
        }}
        onCancel={() => {
          if (pendingAttend) setStages(pendingAttend.snapshot)
          setPendingAttend(null)
        }}
      />

      {/* feat5 — Cancelado: exige o motivo antes de persistir. */}
      <CancelLeadDialog
        open={pendingCancel !== null}
        onOpenChange={(o) => {
          if (!o) setPendingCancel(null)
        }}
        leadName={pendingCancel?.leadName ?? 'Lead'}
        pending={isPending}
        wasAttended={pendingCancel?.wasAttended ?? false}
        onConfirm={(reason) => {
          if (!pendingCancel) return
          const p = pendingCancel
          setPendingCancel(null)
          persistMove(p.leadId, p.stageId, p.position, p.snapshot, reason)
        }}
        onCancel={() => {
          if (pendingCancel) setStages(pendingCancel.snapshot)
          setPendingCancel(null)
        }}
      />

      {/* Fechar = baixa financeira COM detalhes (forma/parcelas/desconto), igual ao
          registro manual. Cancelar restaura o snapshot (desfaz o move otimista). */}
      <RevenueDetailsDialog
        open={pendingClose !== null}
        onOpenChange={(o) => {
          if (!o && pendingClose) {
            setStages(pendingClose.snapshot)
            setPendingClose(null)
          }
        }}
        title="Fechar e dar baixa financeira"
        description="Gera a receita do procedimento no financeiro. Informe forma de pagamento, parcelas e desconto."
        pending={isPending}
        onConfirm={(details) => {
          if (!pendingClose) return
          const p = pendingClose
          setPendingClose(null)
          persistMove(p.leadId, p.stageId, p.position, p.snapshot, undefined, details)
        }}
        onCancel={() => {
          if (pendingClose) setStages(pendingClose.snapshot)
          setPendingClose(null)
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
              {pendingRegress?.toKey === 'SCHEDULED'
                ? `Mover ${pendingRegress?.leadName ?? 'este card'} de volta para Agendado vai reagendar o MESMO agendamento (sem criar outro) e desfazer o comparecimento/baixa financeira, conforme o caso. Deseja continuar?`
                : `Mover ${pendingRegress?.leadName ?? 'este card'} para uma etapa anterior vai desfazer os efeitos já aplicados (agendamento, comparecimento e baixa financeira, conforme o caso). Deseja continuar?`}
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

      <ClientCard
        open={drawerLeadId !== null}
        clientId={clientId}
        subject={
          drawerLeadId
            ? {
                type: 'lead',
                id: drawerLeadId,
                stages,
                pipelineKind,
                pipelineId,
                pipelineCategory,
                pipelines: allPipelines,
              }
            : null
        }
        onClose={() => setDrawerLeadId(null)}
        onChanged={handleLeadUpdated}
      />
    </>
  )
}
