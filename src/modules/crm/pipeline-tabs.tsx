'use client'

import type { PipelineCategory, PipelineKind } from '@prisma/client'
import { Loader2, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ClinicSchedule } from '@/modules/appointments/types'
import { createPipelineAction } from '@/server/actions/pipeline-actions'

import { KanbanBoard } from './kanban-board'
import { PipelineSearch } from './pipeline-search'
import { RetentionHelp } from './retention-help'
import type { ProcedureOption } from './schedule-lead-dialog'
import type { KanbanStage } from './types'

const MAX_PIPELINES = 6

export type PipelineTab = {
  id: string
  name: string
  kind: PipelineKind
  category: PipelineCategory
  order: number
  stages: KanbanStage[]
}

type Props = {
  clientId: string
  pipelines: PipelineTab[]
  procedures: ProcedureOption[]
  schedule: ClinicSchedule
}

/**
 * Abas dinâmicas de pipelines (≤6). Substitui as duas abas fixas NEW/EXISTING:
 * cada aba é uma `Pipeline` da clínica; a aba "+" cria uma nova pipeline CUSTOM.
 * Cada aba monta um KanbanBoard com seu `pipelineId`/`kind`.
 */
export function PipelineTabs({ clientId, pipelines, procedures, schedule }: Props) {
  const router = useRouter()
  const [active, setActive] = useState<string>(pipelines[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  // Card destacado pela busca global (feat6) — limpa sozinho após alguns segundos.
  const [highlightLeadId, setHighlightLeadId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mantém uma aba válida ativa quando a lista muda (criação/exclusão).
  useEffect(() => {
    if (!pipelines.some((p) => p.id === active)) {
      setActive(pipelines[0]?.id ?? '')
    }
  }, [pipelines, active])

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    },
    []
  )

  function handleSearchSelect(pipelineId: string, leadId: string) {
    setActive(pipelineId)
    setHighlightLeadId(leadId)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightLeadId(null), 4000)
  }

  async function handleCreate() {
    if (creating) return
    if (pipelines.length >= MAX_PIPELINES) {
      toast.error('Limite de 6 pipelines atingido')
      return
    }
    setCreating(true)
    const res = await createPipelineAction(clientId, 'Nova pipeline')
    setCreating(false)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    setActive(res.data.id)
    router.refresh()
  }

  return (
    // Coluna flex de altura total: a lista de abas tem altura natural e o
    // conteúdo ativo (min-h-0) toma o resto, dando à board uma altura fixa
    // dentro da qual rolar horizontalmente.
    <Tabs value={active} onValueChange={setActive} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <PipelineSearch pipelines={pipelines} onSelect={handleSearchSelect} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 self-start">
        <TabsList>
          {pipelines.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.name}
            </TabsTrigger>
          ))}
          {pipelines.length < MAX_PIPELINES && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              aria-label="Nova pipeline"
              className="ml-1 inline-flex h-7 items-center justify-center rounded-sm px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </button>
          )}
        </TabsList>
        {pipelines.find((p) => p.id === active)?.kind === 'RETENTION' && <RetentionHelp />}
      </div>

      {pipelines.map((p) => (
        <TabsContent
          key={p.id}
          value={p.id}
          // Mesmas classes flex em toda aba: garante que cada board ocupe a
          // mesma altura. `data-[state=inactive]:hidden` é OBRIGATÓRIO: o Radix
          // esconde a aba inativa com o atributo `hidden` (UA: display:none), mas
          // a classe `flex` (display:flex do autor) VENCE o `[hidden]` — então o
          // painel inativo continua ocupando altura e empurra a aba ativa
          // seguinte pro rodapé. O variante `data-[state=inactive]` tem
          // especificidade maior que `.flex`, devolvendo o display:none real.
          className="mt-0 flex min-h-0 flex-1 flex-col gap-4 data-[state=inactive]:hidden"
        >
          <KanbanBoard
            stages={p.stages}
            clientId={clientId}
            pipelineId={p.id}
            pipelineKind={p.kind}
            pipelineCategory={p.category}
            pipelineName={p.name}
            procedures={procedures}
            schedule={schedule}
            // Lista leve de todos os funis p/ o dialog "Mover para funil".
            allPipelines={pipelines.map((pp) => ({
              id: pp.id,
              name: pp.name,
              category: pp.category,
            }))}
            highlightLeadId={active === p.id ? highlightLeadId : null}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}
