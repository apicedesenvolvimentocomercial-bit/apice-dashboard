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
    // Coluna flex de altura total: a lista de abas tem altura natural e o
    // conteúdo ativo (min-h-0) toma o resto, dando à board uma altura fixa
    // dentro da qual rolar horizontalmente.
    <Tabs defaultValue="new" className="flex min-h-0 flex-1 flex-col gap-4">
      <TabsList className="shrink-0 self-start">
        <TabsTrigger value="new">Clientes novos</TabsTrigger>
        <TabsTrigger value="existing">Clientes cadastrados</TabsTrigger>
      </TabsList>

      <TabsContent value="new" className="mt-0 flex min-h-0 flex-1 flex-col gap-4">
        <KanbanBoard stages={newStages} clientId={clientId} kind="NEW" />
      </TabsContent>

      <TabsContent value="existing" className="mt-0 flex min-h-0 flex-1 flex-col gap-4">
        <KanbanBoard stages={existingStages} clientId={clientId} kind="EXISTING" />
      </TabsContent>
    </Tabs>
  )
}
