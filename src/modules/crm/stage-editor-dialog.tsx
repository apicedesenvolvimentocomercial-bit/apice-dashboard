'use client'

import type { PipelineCategory, PipelineKind } from '@prisma/client'
import { ChevronDown, ChevronUp, Loader2, Lock, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  deletePipelineAction,
  renamePipelineAction,
  setPipelineCategoryAction,
} from '@/server/actions/pipeline-actions'
import {
  createStageAction,
  deleteStageAction,
  reorderStagesAction,
  updateStageAction,
} from '@/server/actions/pipeline-stage-actions'
import type { KanbanStage } from './types'

const DEFAULT_COLOR = '#6b7280'

type Row = {
  id: string
  name: string
  color: string
  isWon: boolean
  isLost: boolean
  isNative: boolean
  nativeKey: KanbanStage['nativeKey']
  // Marca linhas alteradas para salvar só o que mudou.
  dirty: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  pipelineId: string
  pipelineKind: PipelineKind
  pipelineCategory: PipelineCategory
  pipelineName: string
  stages: KanbanStage[]
}

/**
 * Editor de etapas + da própria pipeline (botão lápis). Permite renomear a
 * pipeline (e excluí-la se for CUSTOM), além de renomear/recolorir/reordenar/
 * excluir etapas e criar novas. Etapas nativas (`isNative`) não podem ser
 * excluídas. As mudanças de nome/cor de etapa são acumuladas localmente e
 * persistidas em lote ao salvar; ordem, criação e exclusão persistem na hora.
 */
export function StageEditorDialog({
  open,
  onOpenChange,
  clientId,
  pipelineId,
  pipelineKind,
  pipelineCategory,
  pipelineName,
  stages,
}: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState(pipelineName)
  const [category, setCategory] = useState<PipelineCategory>(pipelineCategory)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const isNativePipeline = pipelineKind !== 'CUSTOM'

  useEffect(() => {
    if (!open) return
    setName(pipelineName)
    setCategory(pipelineCategory)
    setRows(
      stages.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color ?? DEFAULT_COLOR,
        isWon: s.isWon,
        isLost: s.isLost,
        isNative: s.isNative,
        nativeKey: s.nativeKey,
        dirty: false,
      }))
    )
  }, [open, stages, pipelineName, pipelineCategory])

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r)))
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    ;[next[index], next[target]] = [next[target], next[index]]
    setRows(next)
    setBusy(true)
    const res = await reorderStagesAction(
      pipelineId,
      clientId,
      next.map((r) => r.id)
    )
    setBusy(false)
    if (!res.success) {
      toast.error(res.error.message)
      setRows(rows) // reverte
      return
    }
    router.refresh()
  }

  async function addStage() {
    setBusy(true)
    const res = await createStageAction(pipelineId, clientId, {
      name: 'Nova etapa',
      color: DEFAULT_COLOR,
    })
    setBusy(false)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    setRows((prev) => [
      ...prev,
      {
        id: res.data.id,
        name: 'Nova etapa',
        color: DEFAULT_COLOR,
        isWon: false,
        isLost: false,
        isNative: false,
        nativeKey: null,
        dirty: false,
      },
    ])
    router.refresh()
  }

  async function removeStage(id: string) {
    setBusy(true)
    const res = await deleteStageAction(id, clientId)
    setBusy(false)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== id))
    router.refresh()
  }

  async function removePipeline() {
    if (!confirm(`Excluir a pipeline "${name}"? Os cards precisam estar vazios.`)) return
    setBusy(true)
    const res = await deletePipelineAction(pipelineId, clientId)
    setBusy(false)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    toast.success('Pipeline excluída')
    onOpenChange(false)
    router.refresh()
  }

  async function save() {
    setSaving(true)
    // Nome da pipeline (se mudou).
    if (name.trim() && name.trim() !== pipelineName) {
      const r = await renamePipelineAction(pipelineId, clientId, name.trim())
      if (!r.success) {
        setSaving(false)
        toast.error(r.error.message)
        return
      }
    }
    // Tipo do funil (só CUSTOM; se mudou).
    if (!isNativePipeline && category !== pipelineCategory) {
      const r = await setPipelineCategoryAction(pipelineId, clientId, category)
      if (!r.success) {
        setSaving(false)
        toast.error(r.error.message)
        return
      }
    }
    // Etapas alteradas.
    const dirty = rows.filter((r) => r.dirty)
    const results = await Promise.all(
      dirty.map((r) => updateStageAction(r.id, clientId, { name: r.name, color: r.color }))
    )
    setSaving(false)
    const failed = results.find((r) => !r.success)
    if (failed && !failed.success) {
      toast.error(failed.error.message)
      return
    }
    toast.success('Pipeline atualizada')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Editar pipeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <label htmlFor="pipeline-name" className="text-xs font-medium text-muted-foreground">
            Nome da pipeline
          </label>
          <Input id="pipeline-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {/* Categoria semântica — só editável em funis CUSTOM. Rege o fluxo de mover
            cards entre funis (Lead→Paciente converte; ver "Mover para funil"). */}
        <div className="space-y-1">
          <label htmlFor="pipeline-category" className="text-xs font-medium text-muted-foreground">
            Tipo do funil
          </label>
          {isNativePipeline ? (
            <p className="text-sm text-muted-foreground">
              {category === 'LEAD' ? 'Lead' : category === 'PATIENT' ? 'Paciente' : 'Outro'} (funil
              nativo — tipo fixo)
            </p>
          ) : (
            <select
              id="pipeline-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as PipelineCategory)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="LEAD">Lead</option>
              <option value="PATIENT">Paciente</option>
              <option value="OTHER">Outro</option>
            </select>
          )}
        </div>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row.id} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === 0 || busy || row.isNative}
                  onClick={() => move(i, -1)}
                  aria-label="Mover etapa para cima"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === rows.length - 1 || busy || row.isNative}
                  onClick={() => move(i, 1)}
                  aria-label="Mover etapa para baixo"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <input
                type="color"
                value={row.color}
                onChange={(e) => patchRow(row.id, { color: e.target.value })}
                className="h-8 w-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                aria-label="Cor da etapa"
              />

              <Input
                value={row.name}
                onChange={(e) => patchRow(row.id, { name: e.target.value })}
                className="flex-1"
              />

              {row.isNative ? (
                <span
                  className="text-muted-foreground/60"
                  title="Etapa nativa — não pode ser excluída"
                  aria-label="Etapa nativa"
                >
                  <Lock className="h-4 w-4" />
                </span>
              ) : (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                  disabled={busy}
                  onClick={() => removeStage(row.id)}
                  aria-label={`Excluir etapa ${row.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addStage} disabled={busy}>
            <Plus className="mr-2 h-4 w-4" />
            Nova etapa
          </Button>
        </div>

        <DialogFooter className="sm:justify-between">
          {!isNativePipeline ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={removePipeline}
              disabled={busy || saving}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir pipeline
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button type="button" onClick={save} disabled={saving || busy}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar alterações
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
