'use client'

import { ChevronRight, Landmark } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import {
  getReceivablesSummaryAction,
  listReceivablesAction,
  markReceivableLostAction,
  markReceivablePaidAction,
  markReceivablePendingAction,
} from '@/server/actions/receivable-actions'
import type { ReceivablesSummary } from '@/server/repositories/receivable-repository'

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

// Badge de status (handoff §8.2): pill 11px/600 com par fundo+texto por kind.
const BADGE_BASE =
  'inline-flex items-center whitespace-nowrap rounded-full px-[11px] py-1 text-[11px] font-semibold leading-none'

const BADGE: Record<string, string> = {
  warn: 'bg-warn-bg text-warn',
  ok: 'bg-ok-bg text-ok',
  destructive: 'bg-destructive/[0.16] text-destructive',
  muted: 'bg-muted text-muted-foreground',
}

function StatusBadge({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={cn(BADGE_BASE, BADGE[kind] ?? BADGE.muted)}>{children}</span>
}

function parcelBadge(r: Row, now: number): { kind: string; label: string } {
  if (r.status === 'PAGO') return { kind: 'ok', label: 'Pago' }
  if (r.status === 'PERDIDO') return { kind: 'destructive', label: 'Perdido' }
  if (r.status === 'CANCELADO') return { kind: 'muted', label: 'Cancelado' }
  return new Date(r.dueDate).getTime() < now
    ? { kind: 'destructive', label: 'Vencida' }
    : { kind: 'warn', label: 'Pendente' }
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
  const status: { kind: string; label: string } =
    overdue.length > 0
      ? { kind: 'destructive', label: 'Atrasada' }
      : pending.length === 0
        ? lost
          ? { kind: 'muted', label: 'Encerrada' }
          : { kind: 'ok', label: 'Quitada' }
        : { kind: 'warn', label: 'A receber' }
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

// Mesmo grid no cabeçalho e nas linhas (handoff §8.2; ações mais largas p/ os
// botões reais "Marcar pago"/"Baixar").
const GRID =
  'grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.3fr)_120px_150px_110px_180px] items-center gap-3.5'

/**
 * Aba Contas a Receber — redesign Senno (Financeiro-handoff §8): 4 cards de
 * resumo (agregados no servidor, independem da paginação) + tabela de títulos
 * com parcelas expansíveis (chevron 0↔90°, sub-linhas tracejadas em muted).
 */
export function ReceivablesTab({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<ReceivablesSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Recarrega a PRIMEIRA página + resumo (estado inicial e após mutações — a
  // parcela alterada pode mudar de posição/status/bucket do resumo).
  const load = useCallback(() => {
    setLoading(true)
    Promise.all([listReceivablesAction(clientId), getReceivablesSummaryAction(clientId)]).then(
      ([listRes, sumRes]) => {
        if (listRes.success) {
          setRows(listRes.data.rows as Row[])
          setHasMore(listRes.data.hasMore)
          setNextCursor(listRes.data.nextCursor)
        } else toast.error(listRes.error.message)
        if (sumRes.success) setSummary(sumRes.data)
        setLoading(false)
      }
    )
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

  // Ações por parcela (linha simples e parcelas expandidas) — botões-texto (§8.2).
  function parcelActions(r: Row) {
    return (
      <div className="flex justify-end gap-3">
        {r.status === 'PENDENTE' && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                act(() => markReceivablePaidAction(clientId, r.id), 'Marcada como paga')
              }
              className="whitespace-nowrap text-[12.5px] font-semibold text-primary-text hover:underline disabled:opacity-50"
            >
              Marcar pago
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                act(() => markReceivableLostAction(clientId, r.id), 'Baixada como perda')
              }
              className="whitespace-nowrap text-[12.5px] font-semibold text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
            >
              Baixar
            </button>
          </>
        )}
        {(r.status === 'PAGO' || r.status === 'PERDIDO') && (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => markReceivablePendingAction(clientId, r.id), 'Revertida')}
            className="whitespace-nowrap text-[12.5px] font-semibold text-primary-text hover:underline disabled:opacity-50"
          >
            Reverter
          </button>
        )}
      </div>
    )
  }

  // ---- Cards de resumo (handoff §8.1) ----
  const cards = summary
    ? [
        { label: 'Em aberto', ...summary.open, valueClass: '' },
        {
          label: 'Vencido',
          ...summary.overdue,
          valueClass: summary.overdue.total > 0 ? 'text-destructive' : '',
        },
        { label: 'Perdido', ...summary.lost, valueClass: 'text-destructive' },
        { label: 'Recebidas', ...summary.paid, valueClass: 'text-muted-foreground' },
      ]
    : null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(228px,1fr))]">
        {cards
          ? cards.map((c) => (
              <div
                key={c.label}
                className="rounded-[13px] border border-border bg-card px-[17px] py-[15px] shadow-card transition-colors hover:border-primary/50"
              >
                <div className="text-xs font-medium text-muted-foreground">{c.label}</div>
                <div
                  className={cn(
                    'mt-[7px] text-xl font-bold tabular-nums tracking-[-0.01em]',
                    c.valueClass
                  )}
                >
                  {brl(c.total)}
                </div>
                <div className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">
                  {c.count} {c.count === 1 ? 'parcela' : 'parcelas'}
                </div>
              </div>
            ))
          : Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[13px] border border-border bg-card px-[17px] py-[15px] shadow-card"
              >
                <div className="senno-shimmer h-3 w-20 rounded" />
                <div className="senno-shimmer mt-2 h-6 w-28 rounded" />
                <div className="senno-shimmer mt-1.5 h-2.5 w-16 rounded" />
              </div>
            ))}
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
          <div className={cn(GRID, 'border-b border-border bg-muted/40 px-[18px] py-[11px]')}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="senno-shimmer h-3 w-3/5 rounded" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn(GRID, 'border-t border-border px-[18px] py-[13px]')}>
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="senno-shimmer h-3 w-4/5 rounded" />
              ))}
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-[11px] rounded-[13px] border border-dashed border-border bg-card px-6 py-[46px] text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-muted text-muted-foreground">
            <Landmark className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="text-sm font-semibold">Nenhuma parcela em aberto</div>
          <p className="-mt-1 max-w-[420px] text-[12.5px] text-muted-foreground">
            Lançamentos de receita a prazo geram parcelas aqui, com vencimento e baixa por pagamento
            ou perda.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[13px] border border-border bg-card shadow-card">
          <div className="min-w-[900px]">
            <div
              className={cn(
                GRID,
                'border-b border-border bg-muted/40 px-[18px] py-[11px] text-[11.5px] font-semibold uppercase tracking-[0.02em] text-muted-foreground'
              )}
            >
              <div>Cliente / Descrição</div>
              <div>Parcelas</div>
              <div>Vencimento</div>
              <div className="text-right">Valor</div>
              <div>Status</div>
              <div className="text-right">Ações</div>
            </div>

            {groups.map((g) => {
              // Venda à vista / 1 parcela → linha direta (sem agrupar/expandir).
              if (g.parcels.length === 1) {
                const r = g.parcels[0]
                const badge = parcelBadge(r, now)
                return (
                  <div
                    key={g.revenueId}
                    className={cn(
                      GRID,
                      'border-t border-border px-[18px] py-[13px] transition-colors hover:bg-accent/40'
                    )}
                  >
                    <div className="truncate text-[13px] font-semibold">{r.label}</div>
                    <div className="text-[12.5px] tabular-nums text-muted-foreground">À vista</div>
                    <div className="text-[12.5px] tabular-nums text-foreground">
                      {dt(r.dueDate)}
                    </div>
                    <div className="text-right text-[13px] font-semibold tabular-nums">
                      {brl(r.amount)}
                    </div>
                    <div>
                      <StatusBadge kind={badge.kind}>{badge.label}</StatusBadge>
                    </div>
                    {parcelActions(r)}
                  </div>
                )
              }

              // Parcelamento → linha-resumo clicável que expande nas parcelas.
              const s = summarize(g, now)
              const isOpen = expanded.has(g.revenueId)
              return (
                <Fragment key={g.revenueId}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(g.revenueId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggle(g.revenueId)
                      }
                    }}
                    className={cn(
                      GRID,
                      'cursor-pointer border-t border-border px-[18px] py-[13px] transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-[9px]">
                      <span
                        title="Ver parcelas"
                        className={cn(
                          'flex h-[22px] w-[22px] flex-none items-center justify-center text-muted-foreground transition-transform duration-150',
                          isOpen && 'rotate-90'
                        )}
                        aria-hidden="true"
                      >
                        <ChevronRight className="h-[15px] w-[15px]" />
                      </span>
                      <span className="truncate text-[13px] font-semibold">{g.label}</span>
                    </div>
                    <div className="text-[12.5px] tabular-nums text-muted-foreground">
                      {g.totalInstallments}x · {s.paidCount}/{s.activeCount} pagas
                    </div>
                    <div className="text-[12.5px] tabular-nums text-foreground">
                      {s.nextDue ? `próx. ${dt(s.nextDue)}` : '—'}
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="text-[13px] font-semibold">{brl(s.total)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {brl(s.paidSum)} recebido
                      </div>
                    </div>
                    <div>
                      <StatusBadge kind={s.status.kind}>{s.status.label}</StatusBadge>
                    </div>
                    <div className="text-right">
                      <span className="text-[12.5px] font-semibold text-muted-foreground">
                        {isOpen ? 'fechar' : 'ver parcelas'}
                      </span>
                    </div>
                  </div>

                  {/* Sub-linhas de parcelas (handoff §8.2) */}
                  {isOpen && (
                    <div className="border-t border-border bg-muted/35 py-1.5 pl-[49px] pr-[18px]">
                      {g.parcels.map((r) => {
                        const badge = parcelBadge(r, now)
                        return (
                          <div
                            key={r.id}
                            className="grid grid-cols-[minmax(0,1fr)_150px_150px_110px_180px] items-center gap-3.5 border-b border-dashed border-border py-[9px] last:border-b-0"
                          >
                            <div className="text-[12.5px] text-foreground">
                              Parcela {r.installmentNumber}/{g.totalInstallments}
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                              {dt(r.dueDate)}
                            </div>
                            <div className="text-right text-[12.5px] font-semibold tabular-nums">
                              {brl(r.amount)}
                            </div>
                            <div>
                              <StatusBadge kind={badge.kind}>{badge.label}</StatusBadge>
                            </div>
                            {parcelActions(r)}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Fragment>
              )
            })}

            {hasMore && (
              <div className="flex justify-center border-t border-border py-3">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={loadMore}
                  className="h-[34px] rounded-[9px] border border-border bg-card px-4 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais parcelas'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
