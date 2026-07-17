'use client'

import type { PipelineCategory, PipelineKind } from '@prisma/client'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import type { ClinicSchedule } from '@/modules/appointments/types'
import { getKanbanLeadAction } from '@/server/actions/lead-actions'
import { createPipelineAction } from '@/server/actions/pipeline-actions'

import { KanbanBoard } from './kanban-board'
import { PipelineSearch } from './pipeline-search'
import { RetentionHelp } from './retention-help'
import type { ProcedureOption } from './schedule-lead-dialog'
import { StageEditorDialog } from './stage-editor-dialog'
import type { KanbanLead, KanbanStage } from './types'

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
  /** Lead a destacar vindo da URL (`?highlight=` — redirect do "Novo lead"
   *  global do topbar). O card é buscado por id e recebe o mesmo tratamento
   *  da busca global (ativa a aba, injeta na coluna, destaca + scroll). */
  highlightFromUrl?: string | null
}

/**
 * Abas dinâmicas de pipelines (≤6) — redesign Funil (handoff §6): switch
 * dourado com pílula deslizante (mesmo primitivo da Agenda/PeriodBar), "+" de
 * novo funil e ajuda à esquerda; "Editar etapas" (da pipeline ATIVA) à direita,
 * dentro do conteúdo (design.md §4). Cada aba monta um KanbanBoard que fica
 * MONTADO quando inativo (display:none) p/ preservar páginas já carregadas.
 */
export function PipelineTabs({
  clientId,
  pipelines,
  procedures,
  schedule,
  highlightFromUrl,
}: Props) {
  const router = useRouter()
  const [active, setActive] = useState<string>(pipelines[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [stageEditorOpen, setStageEditorOpen] = useState(false)
  // Card destacado pela busca global (feat6) — limpa sozinho após alguns segundos.
  const [highlightLeadId, setHighlightLeadId] = useState<string | null>(null)
  // Card vindo da busca que pode estar ALÉM da página carregada da coluna (M1):
  // o board o injeta na coluna certa antes de destacar.
  const [ensureLead, setEnsureLead] = useState<{ pipelineId: string; lead: KanbanLead } | null>(
    null
  )
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

  // Foca um card: ativa a aba do funil, injeta o card na coluna (se estiver
  // além da página carregada) e destaca por alguns segundos. Compartilhado
  // pela busca global (feat6) e pelo destaque via URL (?highlight=).
  const focusLead = useCallback((pipelineId: string, lead: KanbanLead) => {
    setActive(pipelineId)
    setEnsureLead({ pipelineId, lead })
    setHighlightLeadId(lead.id)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightLeadId(null), 4000)
  }, [])

  // Destaque via URL (redirect do "Novo lead" global do topbar): busca o card
  // por id e o foca. `processed` evita re-foco em re-renders do MESMO param
  // (ex.: router.refresh após mutações no board).
  const processedUrlHighlight = useRef<string | null>(null)
  useEffect(() => {
    if (!highlightFromUrl || processedUrlHighlight.current === highlightFromUrl) return
    processedUrlHighlight.current = highlightFromUrl
    getKanbanLeadAction(clientId, highlightFromUrl).then((res) => {
      if (!res.success) return // card sumiu/sem acesso — segue sem destaque
      focusLead(res.data.pipelineId, res.data.lead as unknown as KanbanLead)
    })
  }, [highlightFromUrl, clientId, focusLead])

  async function handleCreate() {
    if (creating) return
    if (pipelines.length >= MAX_PIPELINES) {
      toast.error('Limite de 6 funis atingido')
      return
    }
    setCreating(true)
    const res = await createPipelineAction(clientId, 'Novo funil')
    setCreating(false)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    setActive(res.data.id)
    router.refresh()
  }

  const activeIdx = Math.max(
    0,
    pipelines.findIndex((p) => p.id === active)
  )
  const activePipeline = pipelines[activeIdx]

  return (
    // Coluna flex de altura total: busca + abas têm altura natural e o board
    // ativo (min-h-0) toma o resto, dando à board uma altura fixa dentro da
    // qual rolar horizontalmente (handoff §1: só o kanban rola).
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <PipelineSearch clientId={clientId} onSelect={focusLead} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {/* Switch dourado com pílula deslizante (handoff §6.1). */}
          {pipelines.length > 0 && (
            <div
              className="relative grid auto-cols-fr grid-flow-col rounded-[10px] border border-border bg-muted p-[3px]"
              role="tablist"
              aria-label="Selecionar funil"
            >
              <div
                className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] z-0 rounded-lg bg-primary shadow-card transition-transform duration-340 ease-senno"
                style={{
                  width: `calc((100% - 6px) / ${pipelines.length})`,
                  transform: `translateX(${activeIdx * 100}%)`,
                }}
                aria-hidden="true"
              />
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={active === p.id}
                  onClick={() => setActive(p.id)}
                  className={cn(
                    'relative z-[1] max-w-[180px] truncate whitespace-nowrap rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors duration-250',
                    active === p.id ? 'text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {pipelines.length < MAX_PIPELINES && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              title="Novo funil"
              aria-label="Novo funil"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="h-[15px] w-[15px] animate-spin" />
              ) : (
                <Plus className="h-[15px] w-[15px]" />
              )}
            </button>
          )}
          {activePipeline?.kind === 'RETENTION' && <RetentionHelp />}
        </div>

        {/* Botão de ação da página DENTRO do conteúdo (handoff §6.2). */}
        {activePipeline && (
          <button
            type="button"
            onClick={() => setStageEditorOpen(true)}
            className="flex h-[38px] items-center gap-2 rounded-[9px] border border-input bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="h-[15px] w-[15px] text-primary-text" aria-hidden="true" />
            Editar etapas
          </button>
        )}
      </div>

      {pipelines.map((p) => (
        <div
          key={p.id}
          // Board inativo fica montado mas com display:none (classe condicional,
          // não o atributo `hidden` — a classe `flex` venceria o [hidden] do UA)
          // p/ preservar páginas carregadas/estado ao alternar de aba.
          className={cn('min-h-0 flex-1 flex-col gap-4', active === p.id ? 'flex' : 'hidden')}
        >
          <KanbanBoard
            stages={p.stages}
            clientId={clientId}
            pipelineId={p.id}
            pipelineKind={p.kind}
            pipelineCategory={p.category}
            procedures={procedures}
            schedule={schedule}
            // Lista leve de todos os funis p/ o dialog "Mover para funil".
            allPipelines={pipelines.map((pp) => ({
              id: pp.id,
              name: pp.name,
              category: pp.category,
            }))}
            highlightLeadId={active === p.id ? highlightLeadId : null}
            ensureLead={ensureLead?.pipelineId === p.id ? ensureLead.lead : null}
          />
        </div>
      ))}

      {/* Editor de etapas do funil ATIVO (o botão vive na linha das abas). */}
      {activePipeline && (
        <StageEditorDialog
          open={stageEditorOpen}
          onOpenChange={setStageEditorOpen}
          clientId={clientId}
          pipelineId={activePipeline.id}
          pipelineKind={activePipeline.kind}
          pipelineCategory={activePipeline.category}
          pipelineName={activePipeline.name}
          stages={activePipeline.stages}
        />
      )}
    </div>
  )
}
