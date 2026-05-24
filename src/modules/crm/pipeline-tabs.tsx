'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { KanbanBoard } from './kanban-board'
import type { KanbanStage } from './types'

type Props = {
  clientId: string
  newStages: KanbanStage[]
  existingStages: KanbanStage[]
}

/**
 * Dois funis na mesma página: NEW (clientes novos / leads) e EXISTING
 * (clientes já cadastrados / pacientes). Cada aba monta um KanbanBoard com seu
 * `kind`, que por sua vez ajusta o botão de adicionar e o editor de etapas.
 */
export function PipelineTabs({ clientId, newStages, existingStages }: Props) {
  return (
    <Tabs defaultValue="new" className="space-y-4">
      <TabsList>
        <TabsTrigger value="new">Clientes novos</TabsTrigger>
        <TabsTrigger value="existing">Clientes cadastrados</TabsTrigger>
      </TabsList>

      <TabsContent value="new" className="space-y-4">
        <KanbanBoard stages={newStages} clientId={clientId} kind="NEW" />
      </TabsContent>

      <TabsContent value="existing" className="space-y-4">
        <KanbanBoard stages={existingStages} clientId={clientId} kind="EXISTING" />
      </TabsContent>
    </Tabs>
  )
}
