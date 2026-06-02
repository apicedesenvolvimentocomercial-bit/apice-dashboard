'use client'

import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  listReceivablesAction,
  markReceivableLostAction,
  markReceivablePaidAction,
  markReceivablePendingAction,
} from '@/server/actions/receivable-actions'

type Row = {
  id: string
  installmentNumber: number
  totalInstallments: number
  amount: number
  dueDate: string | Date
  status: 'PENDENTE' | 'PAGO' | 'PERDIDO' | 'CANCELADO'
  paidAt: string | Date | null
  paymentMethod: string | null
  label: string
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (d: string | Date) => new Date(d).toLocaleDateString('pt-BR')

const STATUS: Record<
  Row['status'],
  { label: string; variant: 'secondary' | 'success' | 'destructive' | 'outline' }
> = {
  PENDENTE: { label: 'Pendente', variant: 'secondary' },
  PAGO: { label: 'Pago', variant: 'success' },
  PERDIDO: { label: 'Perdido', variant: 'destructive' },
  CANCELADO: { label: 'Cancelado', variant: 'outline' },
}

export function ReceivablesTab({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()

  const load = useCallback(() => {
    setLoading(true)
    listReceivablesAction(clientId).then((res) => {
      if (res.success) setRows(res.data as Row[])
      else toast.error(res.error.message)
      setLoading(false)
    })
  }, [clientId])

  useEffect(() => load(), [load])

  function act(fn: () => Promise<{ success: boolean; error?: { message: string } }>, ok: string) {
    startTransition(async () => {
      const res = await fn()
      if (!res.success) {
        toast.error(res.error?.message ?? 'Erro')
        return
      }
      toast.success(ok)
      load()
    })
  }

  const now = Date.now()

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Nenhuma parcela. Lançamentos de receita a prazo geram parcelas aqui.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Cliente / Descrição</th>
            <th className="px-3 py-2">Parcela</th>
            <th className="px-3 py-2">Vencimento</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const overdue = r.status === 'PENDENTE' && new Date(r.dueDate).getTime() < now
            return (
              <tr key={r.id} className={overdue ? 'bg-destructive/5' : ''}>
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.installmentNumber}/{r.totalInstallments}
                </td>
                <td className="px-3 py-2">
                  {dt(r.dueDate)}
                  {overdue && <span className="ml-1 text-xs text-destructive">vencida</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(r.amount)}</td>
                <td className="px-3 py-2">
                  <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {r.status === 'PENDENTE' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            act(() => markReceivablePaidAction(clientId, r.id), 'Marcada como paga')
                          }
                        >
                          Marcar pago
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            act(
                              () => markReceivableLostAction(clientId, r.id),
                              'Baixada como perda'
                            )
                          }
                        >
                          Baixar
                        </Button>
                      </>
                    )}
                    {(r.status === 'PAGO' || r.status === 'PERDIDO') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          act(() => markReceivablePendingAction(clientId, r.id), 'Revertida')
                        }
                      >
                        Reverter
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
