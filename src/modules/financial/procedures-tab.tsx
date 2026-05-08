'use client'

import { AlertTriangle, Edit2, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  deleteProcedureAction,
  toggleProcedureActiveAction,
} from '@/server/actions/procedure-actions'
import { CreateProcedureDialog } from './create-procedure-dialog'
import { formatCurrency, formatPercent } from './types'
import type { ProcedureWithStats } from './types'

type Props = {
  procedures: ProcedureWithStats[]
  clientId: string
}

export function ProceduresTab({ procedures, clientId }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProcedureWithStats | undefined>()
  const [deleting, setDeleting] = useState<string | null>(null)

  function openCreate() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(proc: ProcedureWithStats) {
    setEditing(proc)
    setDialogOpen(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este procedimento?')) return
    setDeleting(id)
    await deleteProcedureAction(id, clientId)
    toast.success('Procedimento removido')
    router.refresh()
    setDeleting(null)
  }

  async function handleToggle(id: string, current: boolean) {
    await toggleProcedureActiveAction(id, clientId, !current)
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {procedures.length} {procedures.length === 1 ? 'procedimento' : 'procedimentos'}
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo procedimento
        </Button>
      </div>

      {procedures.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum procedimento cadastrado
          </p>
          <Button size="sm" className="mt-4" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar procedimento
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2.5 text-left font-medium">Procedimento</th>
                <th className="px-4 py-2.5 text-right font-medium">Preço</th>
                <th className="px-4 py-2.5 text-right font-medium">Custo</th>
                <th className="px-4 py-2.5 text-right font-medium">Margem</th>
                <th className="px-4 py-2.5 text-right font-medium">Receita 90d</th>
                <th className="px-4 py-2.5 text-right font-medium">Qtd 90d</th>
                <th className="px-4 py-2.5 text-center font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {procedures.map((p) => {
                const lowMargin = p.margin < 30
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={!p.isActive ? 'text-muted-foreground line-through' : ''}>
                          {p.name}
                        </span>
                        {lowMargin && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Margem abaixo de 30% — considere revisar o preço
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(p.price)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {formatCurrency(p.cost)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${p.margin < 0 ? 'text-red-600' : lowMargin ? 'text-amber-600' : 'text-green-700'}`}
                    >
                      {formatPercent(p.margin)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-green-700">
                      {p.revenueTotal90d > 0 ? formatCurrency(p.revenueTotal90d) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {p.countSold90d > 0 ? p.countSold90d : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => handleToggle(p.id, p.isActive)}
                        className={`rounded px-2 py-0.5 text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-500'}`}
                      >
                        {p.isActive ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(p)}
                          aria-label="Editar procedimento"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={deleting === p.id}
                          onClick={() => handleDelete(p.id)}
                          aria-label="Remover procedimento"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateProcedureDialog
        open={dialogOpen}
        clientId={clientId}
        procedure={editing}
        onOpenChange={setDialogOpen}
        onSaved={() => router.refresh()}
      />
    </>
  )
}
