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
import { moveDealStageAction } from '@/server/actions/pipeline-deal-actions'

import { CreateDealDialog } from './create-deal-dialog'
import { DealCard } from './deal-card'
import { DealColumn } from './deal-column'
import { DealDrawer } from './deal-drawer'
import { LostReasonDialog } from './lost-reason-dialog'
import { columnsFromDeals, type PipelineDealView } from './types'

type Props = {
  deals: PipelineDealView[]
  availableClients: { id: string; name: string; status: string }[]
}

export function PipelineBoard({ deals: initialDeals, availableClients }: Props) {
  const router = useRouter()
  const [deals, setDeals] = useState<PipelineDealView[]>(initialDeals)
  const [activeDeal, setActiveDeal] = useState<PipelineDealView | null>(null)
  const [drawerDealId, setDrawerDealId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingLost, setPendingLost] = useState<{ dealId: string; previous: DealStage } | null>(
    null
  )
  const [, startTransition] = useTransition()

  useEffect(() => {
    setDeals(initialDeals)
  }, [initialDeals])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function applyStageLocally(dealId: string, newStage: DealStage) {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d)))
  }

  function persistStageChange(dealId: string, newStage: DealStage, previous: DealStage) {
    startTransition(async () => {
      const result = await moveDealStageAction({ dealId, stage: newStage })
      if (!result.success) {
        toast.error(result.error.message)
        applyStageLocally(dealId, previous)
        return
      }
      router.refresh()
    })
  }

  function handleDragStart({ active }: DragStartEvent) {
    const deal = deals.find((d) => d.id === active.id)
    if (deal) setActiveDeal(deal)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDeal(null)
    if (!over) return

    const dealId = active.id as string
    const newStage = over.id as DealStage
    const current = deals.find((d) => d.id === dealId)
    if (!current || current.stage === newStage) return

    if (newStage === 'LOST') {
      // Pede motivo antes de persistir
      setPendingLost({ dealId, previous: current.stage })
      return
    }

    applyStageLocally(dealId, newStage)
    persistStageChange(dealId, newStage, current.stage)
  }

  function confirmLost(reason: string) {
    if (!pendingLost) return
    const { dealId, previous } = pendingLost
    setPendingLost(null)
    applyStageLocally(dealId, 'LOST')
    startTransition(async () => {
      const result = await moveDealStageAction({ dealId, stage: 'LOST', lostReason: reason })
      if (!result.success) {
        toast.error(result.error.message)
        applyStageLocally(dealId, previous)
        return
      }
      router.refresh()
    })
  }

  const columns = columnsFromDeals(deals)
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
