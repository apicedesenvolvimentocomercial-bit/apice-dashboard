'use client'

import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  listReceivablesAction,
  markReceivableLostAction,
  markReceivablePaidAction,
  markReceivablePendingAction,
} from '@/server/actions/receivable-actions'

type Row = {
  id: string
  revenueId: string
  installmentNumber: number
  totalInstallments: number
  amount: number
  dueDate: string | Date
  status: 'PENDENTE' | 'PAGO' | 'PERDIDO' | 'CANCELADO'
  paidAt: string | Date | null
  paymentMethod: string | null
  label: string
}

// Venda agrupada: todas as parcelas (contas a receber) da mesma Revenue.
type Group = {
  revenueId: string
  label: string
  totalInstallments: number
  parcels: Row[]
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

// Agrupa as parcelas por venda, preservando a ordem do servidor (dueDate asc) p/ a
// 1ª parcela de cada venda definir a posição do grupo. Parcelas ordenadas por nº.
function groupByRevenue(rows: Row[]): Group[] {
  const map = new Map<string, Group>()
  for (const r of rows) {
    let g = map.get(r.revenueId)
    if (!g) {
      g = {
        revenueId: r.revenueId,
        label: r.label,
        totalInstallments: r.totalInstallments,
        parcels: [],
      }
      map.set(r.revenueId, g)
    }
    g.parcels.push(r)
  }
  for (const g of map.values()) g.parcels.sort((a, b) => a.installmentNumber - b.installmentNumber)
  return Array.from(map.values())
}

// Resumo do parcelamento p/ a linha recolhida.
function summarize(g: Group, now: number) {
  const active = g.parcels.filter((p) => p.status !== 'CANCELADO')
  const paid = active.filter((p) => p.status === 'PAGO')
  const total = active.reduce((s, p) => s + p.amount, 0)
  const paidSum = paid.reduce((s, p) => s + p.amount, 0)
  const pending = active.filter((p) => p.status === 'PENDENTE')
  const overdue = pending.filter((p) => new Date(p.dueDate).getTime() < now)
  const nextDue = pending.map((p) => new Date(p.dueDate).getTime()).sort((a, b) => a - b)[0]
  const lost = active.some((p) => p.status === 'PERDIDO')
  const status: { label: string; variant: 'secondary' | 'success' | 'destructive' | 'outline' } =
    overdue.length > 0
      ? { label: 'Atrasada', variant: 'destructive' }
      : pending.length === 0
        ? lost
          ? { label: 'Encerrada', variant: 'outline' }
          : { label: 'Quitada', variant: 'success' }
        : { label: 'A receber', variant: 'secondary' }
  return {
    paidCount: paid.length,
    activeCount: active.length,
    total,
    paidSum,
    nextDue: nextDue ? new Date(nextDue) : null,
    hasOverdue: overdue.length > 0,
    status,
  }
}

export function ReceivablesTab({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Recarrega a PRIMEIRA página (estado inicial e após mutações — a parcela
  // alterada pode mudar de posição/status, então não dá pra remendar in-place).
  const load = useCallback(() => {
    setLoading(true)
    listReceivablesAction(clientId).then((res) => {
      if (res.success) {
        setRows(res.data.rows as Row[])
        setHasMore(res.data.hasMore)
        setNextCursor(res.data.nextCursor)
      } else toast.error(res.error.message)
      setLoading(false)
    })
  }, [clientId])

  const loadMore = useCallback(() => {
    if (!nextCursor) return
    setLoadingMore(true)
    listReceivablesAction(clientId, nextCursor).then((res) => {
      if (res.success) {
        setRows((prev) => [...prev, ...(res.data.rows as Row[])])
        setHasMore(res.data.hasMore)
        setNextCursor(res.data.nextCursor)
      } else toast.error(res.error.message)
      setLoadingMore(false)
    })
  }, [clientId, nextCursor])

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

  function toggle(revenueId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(revenueId)) next.delete(revenueId)
      else next.add(revenueId)
      return next
    })
  }

  const groups = useMemo(() => groupByRevenue(rows), [rows])
  const now = Date.now()

  // Ações por parcela (reusadas na linha simples e nas parcelas expandidas).
  function parcelActions(r: Row) {
    return (
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
                act(() => markReceivableLostAction(clientId, r.id), 'Baixada como perda')
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
            onClick={() => act(() => markReceivablePendingAction(clientId, r.id), 'Revertida')}
          >
            Reverter
          </Button>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    )
  }

  if (groups.length === 0) {
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
            <th className="px-3 py-2">Parcelas</th>
            <th className="px-3 py-2">Vencimento</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {groups.map((g) => {
            // Venda à vista / 1 parcela → linha direta (sem agrupar/expandir).
            if (g.parcels.length === 1) {
              const r = g.parcels[0]
              const overdue = r.status === 'PENDENTE' && new Date(r.dueDate).getTime() < now
              return (
                <tr key={g.revenueId} className={overdue ? 'bg-destructive/5' : ''}>
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-muted-foreground">À vista</td>
                  <td className="px-3 py-2">
                    {dt(r.dueDate)}
                    {overdue && <span className="ml-1 text-xs text-destructive">vencida</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(r.amount)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                  </td>
                  <td className="px-3 py-2">{parcelActions(r)}</td>
                </tr>
              )
            }

            // Parcelamento → linha-resumo clicável que expande nas parcelas.
            const s = summarize(g, now)
            const isOpen = expanded.has(g.revenueId)
            return (
              <Fragment key={g.revenueId}>
                <tr
                  className={cn(
                    'cursor-pointer hover:bg-muted/40',
                    s.hasOverdue && !isOpen && 'bg-destructive/5'
                  )}
                  onClick={() => toggle(g.revenueId)}
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      {g.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {g.totalInstallments}x · {s.paidCount}/{s.activeCount} pagas
                  </td>
                  <td className="px-3 py-2">
                    {s.nextDue ? (
                      <>
                        próx. {dt(s.nextDue)}
                        {s.hasOverdue && (
                          <span className="ml-1 text-xs text-destructive">atrasada</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {brl(s.total)}
                    <div className="text-xs text-muted-foreground">{brl(s.paidSum)} recebido</div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={s.status.variant}>{s.status.label}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {isOpen ? 'fechar' : 'ver parcelas'}
                  </td>
                </tr>
                {isOpen &&
                  g.parcels.map((r) => {
                    const overdue = r.status === 'PENDENTE' && new Date(r.dueDate).getTime() < now
                    return (
                      <tr key={r.id} className={cn('bg-muted/20', overdue && 'bg-destructive/5')}>
                        <td className="px-3 py-2 pl-9 text-muted-foreground">{r.label}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.installmentNumber}/{g.totalInstallments}
                        </td>
                        <td className="px-3 py-2">
                          {dt(r.dueDate)}
                          {overdue && (
                            <span className="ml-1 text-xs text-destructive">vencida</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{brl(r.amount)}</td>
                        <td className="px-3 py-2">
                          <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                        </td>
                        <td className="px-3 py-2">{parcelActions(r)}</td>
                      </tr>
                    )
                  })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {hasMore && (
        <div className="flex justify-center border-t py-3">
          <Button size="sm" variant="outline" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Carregando…
              </>
            ) : (
              'Carregar mais parcelas'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
