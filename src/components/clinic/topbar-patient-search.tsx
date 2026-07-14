'use client'

import { Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { ClientCard, type ClientCardSubject } from '@/components/clinic/client-card/client-card'
import { getInitials } from '@/lib/utils'
import {
  getPatientCommercialLeadContextAction,
  searchPatientsQuickAction,
} from '@/server/actions/patient-actions'

type Row = {
  id: string
  name: string
  phone: string | null
  lastVisitAt: Date | null
  fromScheduledLead: boolean
}

/** Normaliza p/ match e realce: minúsculas + sem acentos (handoff §3.1). */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Realce do trecho casado no nome (dourado-texto sobre tint de primary). */
function HighlightedName({ name, query }: { name: string; query: string }) {
  const q = norm(query.trim())
  const i = q ? norm(name).indexOf(q) : -1
  if (i < 0 || !q) return <>{name}</>
  return (
    <>
      {name.slice(0, i)}
      <span className="rounded-[3px] bg-primary/[0.16] px-px font-bold text-primary-text">
        {name.slice(i, i + q.length)}
      </span>
      {name.slice(i + q.length)}
    </>
  )
}

function statusPill(p: Row): { label: string; className: string } {
  if (p.fromScheduledLead && !p.lastVisitAt)
    return { label: 'Lead', className: 'bg-info-bg text-info-t' }
  if (!p.lastVisitAt) return { label: 'Sem visita', className: 'bg-muted text-muted-foreground' }
  return { label: 'Ativo', className: 'bg-ok-bg text-ok' }
}

/**
 * Busca de paciente do topbar (redesign — handoff §3.1): lupa 38px que expande
 * p/ 240px no hover/focus (direita → esquerda) e abre popover de resultados
 * server-side (debounce 250ms, até 6). Query vazia = pacientes recentes.
 */
export function TopbarPatientSearch({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  // Card da pessoa clicada (o MESMO drawer do funil/aba Pacientes). Quem ainda
  // é LEAD (card comercial ativo) abre o card de lead do funil; senão, o card
  // unificado de paciente — resolvido no clique (openPersonCard).
  const [cardSubject, setCardSubject] = useState<ClientCardSubject | null>(null)
  // A resposta de uma busca antiga não pode atropelar a mais recente.
  const requestSeq = useRef(0)

  function openPersonCard(patientId: string) {
    getPatientCommercialLeadContextAction(clientId, patientId).then((r) => {
      if (r.success && r.data) {
        const d = r.data
        setCardSubject({
          type: 'lead',
          id: d.leadId,
          stages: d.stages,
          pipelineKind: d.pipelineKind,
          pipelineId: d.pipelineId,
          pipelineCategory: d.pipelineCategory,
          pipelines: d.pipelines,
        })
      } else {
        setCardSubject({ type: 'patient', id: patientId })
      }
    })
  }

  useEffect(() => {
    if (!open) return
    const seq = ++requestSeq.current
    setLoading(true)
    setError(false)
    const t = setTimeout(async () => {
      try {
        const r = await searchPatientsQuickAction(clientId, query)
        if (seq !== requestSeq.current) return
        if (r.success) setRows(r.data as Row[])
        else setError(true)
      } catch {
        if (seq === requestSeq.current) setError(true)
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [clientId, query, open, retryTick])

  const trimmed = query.trim()
  const listLabel = loading
    ? 'Buscando…'
    : trimmed === ''
      ? 'Pacientes recentes'
      : `${rows.length} resultado${rows.length === 1 ? '' : 's'}`
  const noResults = !loading && !error && trimmed !== '' && rows.length === 0

  return (
    <div className="group relative h-[38px] w-[38px] flex-none">
      <div className="absolute right-0 top-0 flex h-[38px] w-[38px] cursor-pointer items-center gap-2 overflow-hidden whitespace-nowrap rounded-[9px] border border-border bg-background px-[11px] text-[12.5px] text-muted-foreground transition-[width,background-color,border-color,box-shadow] duration-340 ease-senno-io focus-within:w-60 focus-within:cursor-text focus-within:border-[hsl(var(--ring))] focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)] group-hover:w-60 group-hover:cursor-text group-hover:border-input">
        <Search className="h-[15px] w-[15px] flex-none" aria-hidden="true" />
        <input
          type="text"
          placeholder="Buscar paciente…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          aria-label="Buscar paciente"
          className="min-w-0 flex-1 border-none bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-[46px] z-50 w-[344px] overflow-hidden rounded-xl border border-border bg-popover shadow-pop">
            <div className="flex items-center justify-between px-3.5 pb-2 pt-[11px]">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {listLabel}
              </span>
            </div>

            {loading && (
              <div className="flex flex-col gap-1 px-1.5 pb-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-[11px] rounded-lg p-2">
                    <div className="senno-shimmer h-[34px] w-[34px] rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="senno-shimmer h-3 w-3/5 rounded-md" />
                      <div className="senno-shimmer h-2.5 w-2/5 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                <p className="text-[13px] font-medium">Não foi possível buscar</p>
                <button
                  type="button"
                  onClick={() => setRetryTick((t) => t + 1)}
                  className="h-8 rounded-lg border border-input bg-background px-3.5 text-xs font-semibold hover:bg-accent"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {!loading && !error && rows.length > 0 && (
              <div className="flex flex-col px-1.5 pb-1.5">
                {rows.map((p) => {
                  const st = statusPill(p)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        setQuery('')
                        openPersonCard(p.id)
                      }}
                      className="flex w-full items-center gap-[11px] rounded-lg px-2 py-[9px] text-left hover:bg-accent"
                    >
                      <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-primary/[0.16] text-xs font-semibold text-primary-text">
                        {getInitials(p.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          <HighlightedName name={p.name} query={query} />
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          {p.phone ?? 'Sem telefone'}
                        </span>
                      </span>
                      <span
                        className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${st.className}`}
                      >
                        {st.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {noResults && (
              <div className="flex flex-col items-center gap-[9px] px-[18px] pb-6 pt-[22px] text-center">
                <Search
                  className="h-[30px] w-[30px] text-muted-foreground"
                  aria-hidden="true"
                  strokeWidth={1.6}
                />
                <div className="text-[13px] font-medium">Nenhum paciente encontrado</div>
                <div className="-mt-1 text-xs text-muted-foreground">
                  Tente outro nome ou telefone.
                </div>
                <Link
                  href="/patients"
                  onClick={() => setOpen(false)}
                  className="mt-1 inline-flex h-[34px] items-center gap-[7px] rounded-lg bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground hover:brightness-105"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Cadastrar paciente
                </Link>
              </div>
            )}

            <div className="flex items-center justify-between gap-2.5 border-t border-border bg-muted/40 px-3.5 py-[9px]">
              <Link
                href="/patients"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-primary-text hover:underline"
              >
                Ver todos os pacientes
              </Link>
              <span className="text-[10.5px] text-muted-foreground">Esc para fechar</span>
            </div>
          </div>
        </>
      )}

      <ClientCard
        open={cardSubject !== null}
        clientId={clientId}
        subject={cardSubject}
        onClose={() => setCardSubject(null)}
        onChanged={() => {
          setCardSubject(null)
          router.refresh()
        }}
      />
    </div>
  )
}
