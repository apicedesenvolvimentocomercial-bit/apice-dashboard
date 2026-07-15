'use client'

import { Receipt } from 'lucide-react'
import { useState } from 'react'

import { formatBRLCompact } from './format'
import { SeeAllButton, SeeAllOverlay } from './see-all-overlay'

export type ProcedureRevenueItem = { name: string; total: number }

const VISIBLE = 5

function ProcedureLine({
  item,
  max,
  first,
}: {
  item: ProcedureRevenueItem
  max: number
  first: boolean
}) {
  const w = max > 0 ? (item.total / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 flex-none truncate text-xs text-foreground" title={item.name}>
        {item.name}
      </span>
      <div className="h-5 flex-1 overflow-hidden rounded-md bg-muted">
        {/* 1º item (maior) sólido; demais a 0.62 (handoff §9.2). */}
        <div
          className={`h-full rounded-md ${first ? 'bg-primary' : 'bg-primary/[0.62]'}`}
          style={{ width: `${w}%` }}
        />
      </div>
      <span className="w-16 flex-none text-right text-xs font-semibold tabular-nums">
        {formatBRLCompact(item.total)}
      </span>
    </div>
  )
}

/**
 * Card "Receita por procedimento" (handoff §9): 5 barras visíveis, excedente
 * no painel sobreposto "Ver todos". Escala pela maior receita.
 */
export function ProceduresBarsCard({ items }: { items: ProcedureRevenueItem[] }) {
  const [open, setOpen] = useState(false)
  const max = items[0]?.total ?? 0
  const more = items.length - VISIBLE

  return (
    <div className="relative flex h-full flex-col rounded-[13px] border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/50">
      {open && (
        <SeeAllOverlay
          title="Receita por procedimento"
          countPill={`${items.length} procedimentos`}
          onClose={() => setOpen(false)}
        >
          {items.map((p, i) => (
            <ProcedureLine key={p.name} item={p} max={max} first={i === 0} />
          ))}
        </SeeAllOverlay>
      )}

      <div className="flex items-center justify-between gap-2.5">
        <h2 className="m-0 text-[length:clamp(16px,0.22vw+13.2px,17.5px)] font-semibold">
          Receita por procedimento
        </h2>
        {more > 0 && <SeeAllButton label="Ver todos" more={more} onClick={() => setOpen(true)} />}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <Receipt
            className="h-[34px] w-[34px] text-muted-foreground"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium">Sem receita no período</p>
          <p className="-mt-1 text-xs text-muted-foreground">
            Lançamentos com procedimento aparecem aqui ranqueados.
          </p>
        </div>
      ) : (
        <div className="mt-[18px] flex flex-col gap-[13px]">
          {items.slice(0, VISIBLE).map((p, i) => (
            <ProcedureLine key={p.name} item={p} max={max} first={i === 0} />
          ))}
        </div>
      )}
    </div>
  )
}
