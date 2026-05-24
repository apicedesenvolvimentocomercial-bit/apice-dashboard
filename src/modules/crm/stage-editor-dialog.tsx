'use client'

import type { StageKind } from '@prisma/client'
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react'
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
  // Marca linhas alteradas para salvar só o que mudou.
  dirty: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  kind: StageKind
  stages: KanbanStage[]
}

/**
 * Editor de etapas do funil (botão lápis). Permite renomear, recolorir,
 * reordenar (setas) e excluir etapas, além de criar novas. As mudanças de
 * nome/cor são acumuladas localmente e persistidas em lote ao salvar; ordem,
 * criação e exclusão persistem na hora (precisam de id do servidor).
 */
export function StageEditorDialog({ open, onOpenChange, clientId, kind, stages }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setRows(
      stages.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color ?? DEFAULT_COLOR,
        isWon: s.isWon,
        isLost: s.isLost,
        dirty: false,
      }))
    )
  }, [open, stages])

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
      clientId,
      kind,
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
    const res = await createStageAction(clientId, kind, {
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

  async function save() {
    const dirty = rows.filter((r) => r.dirty)
    if (dirty.length === 0) {
      onOpenChange(false)
      return
    }
    setSaving(true)
    const results = await Promise.all(
      dirty.map((r) => updateStageAction(r.id, clientId, { name: r.name, color: r.color }))
    )
    setSaving(false)
    const failed = results.find((r) => !r.success)
    if (failed && !failed.success) {
      toast.error(failed.error.message)
      return
    }
    toast.success('Etapas atualizadas')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Editar etapas do funil</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row.id} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === 0 || busy}
                  onClick={() => move(i, -1)}
                  aria-label="Mover etapa para cima"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === rows.length - 1 || busy}
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

              <button
                type="button"
                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                disabled={busy}
                onClick={() => removeStage(row.id)}
                aria-label={`Excluir etapa ${row.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addStage} disabled={busy}>
            <Plus className="mr-2 h-4 w-4" />
            Nova etapa
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" onClick={save} disabled={saving || busy}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
