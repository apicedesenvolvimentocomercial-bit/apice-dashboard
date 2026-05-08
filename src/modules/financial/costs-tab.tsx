'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { deleteCostAction } from '@/server/actions/cost-actions'
import { CreateCostDialog } from './create-cost-dialog'
import { formatCurrency, COST_TYPE_LABELS } from './types'
import type { CostRow } from './types'

const TYPE_COLORS: Record<string, string> = {
  FIXED: 'bg-blue-100 text-blue-800',
  VARIABLE: 'bg-zinc-100 text-zinc-800',
  MARKETING: 'bg-purple-100 text-purple-800',
  PAYROLL: 'bg-amber-100 text-amber-800',
  TAX: 'bg-red-100 text-red-800',
  OTHER: 'bg-gray-100 text-gray-800',
}

type Props = {
  costs: CostRow[]
  clientId: string
}

export function CostsTab({ costs, clientId }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Remover este custo?')) return
    setDeleting(id)
    await deleteCostAction(id, clientId)
    toast.success('Custo removido')
    router.refresh()
    setDeleting(null)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {costs.length} {costs.length === 1 ? 'custo' : 'custos'}
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo custo
        </Button>
      </div>

      {costs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">Nenhum custo registrado</p>
          <Button size="sm" className="mt-4" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar custo
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2.5 text-left font-medium">Data</th>
                <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                <th className="px-4 py-2.5 text-left font-medium">Categoria</th>
                <th className="px-4 py-2.5 text-left font-medium">Descrição</th>
                <th className="px-4 py-2.5 text-left font-medium">Recorrente</th>
                <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {format(new Date(c.date), 'dd/MM/yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLORS[c.type] ?? ''}`}
                    >
                      {COST_TYPE_LABELS[c.type] ?? c.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{c.category ?? '—'}</td>
                  <td className="px-4 py-2.5">{c.description ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {c.isRecurring ? (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <RefreshCw className="h-2.5 w-2.5" />
                        Dia {c.recurringDay ?? '?'}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-red-700">
                    {formatCurrency(c.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={deleting === c.id}
                      onClick={() => handleDelete(c.id)}
                      aria-label="Remover custo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateCostDialog
        open={dialogOpen}
        clientId={clientId}
        onOpenChange={setDialogOpen}
        onCreated={() => router.refresh()}
      />
    </>
  )
}
