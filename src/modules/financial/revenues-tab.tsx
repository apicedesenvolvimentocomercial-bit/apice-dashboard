'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { deleteRevenueAction } from '@/server/actions/revenue-actions'
import { CreateRevenueDialog } from './create-revenue-dialog'
import { formatCurrency, PAYMENT_METHOD_LABELS } from './types'
import type { RevenueRow, ProcedureForSelect } from './types'

type Patient = { id: string; name: string }

type Props = {
  revenues: RevenueRow[]
  clientId: string
  patients: Patient[]
  procedures: ProcedureForSelect[]
}

export function RevenuesTab({ revenues, clientId, patients, procedures }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Remover esta receita?')) return
    setDeleting(id)
    await deleteRevenueAction(id, clientId)
    toast.success('Receita removida')
    router.refresh()
    setDeleting(null)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {revenues.length} {revenues.length === 1 ? 'receita' : 'receitas'}
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova receita
        </Button>
      </div>

      {revenues.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">Nenhuma receita registrada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Adicione receitas manuais ou elas serão criadas automaticamente ao confirmar
            agendamentos.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar receita
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2.5 text-left font-medium">Data</th>
                <th className="px-4 py-2.5 text-left font-medium">Descrição</th>
                <th className="px-4 py-2.5 text-left font-medium">Paciente</th>
                <th className="px-4 py-2.5 text-left font-medium">Procedimento</th>
                <th className="px-4 py-2.5 text-left font-medium">Pagamento</th>
                <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {revenues.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {format(new Date(r.date), 'dd/MM/yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-4 py-2.5">{r.description ?? '—'}</td>
                  <td className="px-4 py-2.5">{r.patient?.name ?? '—'}</td>
                  <td className="px-4 py-2.5">{r.procedure?.name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {r.paymentMethod ? (
                      <Badge variant="secondary" className="text-xs">
                        {PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}
                        {(r.installments ?? 1) > 1 ? ` ${r.installments}x` : ''}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-green-700">
                    {formatCurrency(r.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={deleting === r.id}
                      onClick={() => handleDelete(r.id)}
                      aria-label="Remover receita"
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

      <CreateRevenueDialog
        open={dialogOpen}
        clientId={clientId}
        patients={patients}
        procedures={procedures}
        onOpenChange={setDialogOpen}
        onCreated={() => router.refresh()}
      />
    </>
  )
}
