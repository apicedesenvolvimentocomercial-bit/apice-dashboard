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
import type { DealStage } from '@prisma/client'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { moveDealStageAction, reorderDealAction } from '@/server/actions/pipeline-deal-actions'

import { CreateDealDialog } from './create-deal-dialog'
import { DealCard } from './deal-card'
import { DealColumn } from './deal-column'
import { DealDrawer } from './deal-drawer'
import { LostReasonDialog } from './lost-reason-dialog'
import { columnsFromDeals, STAGE_ORDER, type PipelineDealView } from './types'

type Props = {
  deals: PipelineDealView[]
  availableClients: { id: string; name: string; status: string }[]
}

// Calcula uma posição fracionária entre dois vizinhos. Sem vizinho, abre um
// gap fixo de 1000 — suficiente para muitas inserções antes de precisar
// rebalancear (que hoje nem é necessário, já que Float aguenta bem).
function positionBetween(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return 1000
  if (prev == null) return (next as number) - 1000
  if (next == null) return (prev as number) + 1000
  return (prev + next) / 2
}

function isStageId(id: string): id is DealStage {
  return (STAGE_ORDER as string[]).includes(id)
}

export function PipelineBoard({ deals: initialDeals, availableClients }: Props) {
  const router = useRouter()
  const [deals, setDeals] = useState<PipelineDealView[]>(initialDeals)
  const [activeDeal, setActiveDeal] = useState<PipelineDealView | null>(null)
  const [drawerDealId, setDrawerDealId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingLost, setPendingLost] = useState<{
    dealId: string
    previous: DealStage
    position: number
  } | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    setDeals(initialDeals)
  }, [initialDeals])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragStart({ active }: DragStartEvent) {
    const deal = deals.find((d) => d.id === active.id)
    if (deal) setActiveDeal(deal)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDeal(null)
    if (!over) return

    const dealId = active.id as string
    const current = deals.find((d) => d.id === dealId)
    if (!current) return

    const overId = over.id as string

    // Identifica a coluna destino: ou veio direto do overId (drop em área
    // vazia da coluna), ou herdamos do stage do card sob o cursor.
    let destStage: DealStage
    let overDealId: string | null = null
    if (isStageId(overId)) {
      destStage = overId
    } else {
      const overDeal = deals.find((d) => d.id === overId)
      if (!overDeal) return
      destStage = overDeal.stage
      overDealId = overDeal.id
    }

    // Snapshot dos cards da coluna destino (sem o card arrastado), em ordem.
    const destDealsBefore = deals
      .filter((d) => d.stage === destStage && d.id !== dealId)
      .sort((a, b) => a.position - b.position)

    // Onde inserir: acima do card-alvo, ou ao final quando soltou na área
    // vazia da coluna (overId é a stage).
    const insertIndex =
      overDealId === null
        ? destDealsBefore.length
        : Math.max(
            0,
            destDealsBefore.findIndex((d) => d.id === overDealId)
          )

    const prev = insertIndex > 0 ? destDealsBefore[insertIndex - 1].position : null
    const next = insertIndex < destDealsBefore.length ? destDealsBefore[insertIndex].position : null
    const newPosition = positionBetween(prev, next)

    const movingColumns = current.stage !== destStage

    // Para LOST, dispara o diálogo de motivo antes de persistir.
    if (movingColumns && destStage === 'LOST') {
      setPendingLost({ dealId, previous: current.stage, position: newPosition })
      return
    }

    // Otimista: atualiza o estado local imediatamente para o usuário ver
    // o card no novo lugar antes da resposta do servidor.
    const previousStage = current.stage
    const previousPosition = current.position
    applyLocal(dealId, destStage, newPosition)

    if (movingColumns) {
      persistMove(dealId, destStage, newPosition, previousStage, previousPosition)
    } else {
      // Mesma coluna: usa arrayMove só para consistência visual quando o
      // card-alvo está acima do arrastado (ajustes finos de índice).
      persistReorder(dealId, newPosition, previousStage, previousPosition)
    }
  }

  function applyLocal(dealId: string, stage: DealStage, position: number) {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage, position } : d)))
  }

  function persistMove(
    dealId: string,
    newStage: DealStage,
    position: number,
    previousStage: DealStage,
    previousPosition: number
  ) {
    startTransition(async () => {
      const result = await moveDealStageAction({ dealId, stage: newStage, position })
      if (!result.success) {
        toast.error(result.error.message)
        applyLocal(dealId, previousStage, previousPosition)
        return
      }
      router.refresh()
    })
  }

  function persistReorder(
    dealId: string,
    position: number,
    previousStage: DealStage,
    previousPosition: number
  ) {
    startTransition(async () => {
      const result = await reorderDealAction({ dealId, position })
      if (!result.success) {
        toast.error(result.error.message)
        applyLocal(dealId, previousStage, previousPosition)
        return
      }
      router.refresh()
    })
  }

  function confirmLost(reason: string) {
    if (!pendingLost) return
    const { dealId, previous, position } = pendingLost
    setPendingLost(null)
    const current = deals.find((d) => d.id === dealId)
    const previousPosition = current?.position ?? position
    applyLocal(dealId, 'LOST', position)
    startTransition(async () => {
      const result = await moveDealStageAction({
        dealId,
        stage: 'LOST',
        position,
        lostReason: reason,
      })
      if (!result.success) {
        toast.error(result.error.message)
        applyLocal(dealId, previous, previousPosition)
        return
      }
      router.refresh()
    })
  }

  const sortedDeals = [...deals].sort((a, b) => a.position - b.position)
  const columns = columnsFromDeals(sortedDeals)
  const drawerDeal = drawerDealId ? (deals.find((d) => d.id === drawerDealId) ?? null) : null

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline comercial</h1>
          <p className="text-muted-foreground">
            {deals.length} {deals.length === 1 ? 'negociação' : 'negociações'} no funil.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova negociação
        </Button>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex min-h-[calc(100vh-12rem)] gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <DealColumn
              key={col.stage}
              column={col}
              onDealClick={(dealId) => setDrawerDealId(dealId)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDeal && <DealCard deal={activeDeal} isDragOverlay />}
        </DragOverlay>
      </DndContext>

      <CreateDealDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        availableClients={availableClients}
      />

      <DealDrawer
        open={drawerDeal !== null}
        deal={drawerDeal}
        onClose={() => setDrawerDealId(null)}
      />

      <LostReasonDialog
        open={pendingLost !== null}
        pending={false}
        onCancel={() => setPendingLost(null)}
        onConfirm={confirmLost}
      />
    </>
  )
}
