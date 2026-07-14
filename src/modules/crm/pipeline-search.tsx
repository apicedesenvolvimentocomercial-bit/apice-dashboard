'use client'

import { Loader2, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { getInitials } from '@/lib/utils'
import { searchLeadsAction } from '@/server/actions/lead-actions'

import type { KanbanLead } from './types'

type Match = {
  lead: KanbanLead
  pipelineId: string
  pipelineName: string
  stageName: string
}

type Props = {
  clientId: string
  /** Achou e clicou → o pai troca de aba, injeta o card (se fora da página) e destaca. */
  onSelect: (pipelineId: string, lead: KanbanLead) => void
}

/**
 * feat6 — Busca global de leads/pacientes em TODOS os funis de uma vez
 * (redesign: Funil-handoff §5). SERVER-SIDE (M1): o board é paginado por
 * coluna, então a busca em memória só veria a 1ª página. Debounce de 250ms;
 * casa por nome, telefone (dígitos) ou e-mail.
 */
export function PipelineSearch({ clientId, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [matches, setMatches] = useState<Match[]>([])
  const [searching, setSearching] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Descarte de respostas fora de ordem (a busca anterior pode chegar depois).
  const requestSeq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (q.length < 2) {
      setMatches([])
      setSearching(false)
      return
    }
    setSearching(true)
    const seq = ++requestSeq.current
    debounceTimer.current = setTimeout(() => {
      searchLeadsAction(clientId, q).then((res) => {
        if (seq !== requestSeq.current) return // resposta velha — descarta
        setSearching(false)
        if (res.success) setMatches(res.data as unknown as Match[])
        else setMatches([])
      })
    }, 250)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [query, clientId])

  const showDropdown = focused && query.trim().length >= 2

  function pick(m: Match) {
    onSelect(m.pipelineId, m.lead)
    setQuery('')
    setMatches([])
    setFocused(false)
  }

  return (
    <div className="relative w-[380px] max-w-full">
      {/* Barra ampla do corpo (handoff §5): 40px, bg-card, foco com anel ring. */}
      <div className="flex h-10 items-center gap-2 rounded-[10px] border border-input bg-card px-[13px] transition-shadow focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]">
        <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current)
            setFocused(true)
          }}
          // Atrasa o blur para o clique no resultado registrar antes de fechar.
          onBlur={() => {
            blurTimer.current = setTimeout(() => setFocused(false), 150)
          }}
          placeholder="Buscar em todos os funis (nome, telefone, e-mail)…"
          className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Buscar em todos os funis"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
            className="flex-none text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1.5 max-h-80 w-full overflow-y-auto rounded-[11px] border border-border bg-popover p-[5px] text-popover-foreground shadow-pop">
          {searching ? (
            <p className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
            </p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-2.5 text-[13px] text-muted-foreground">Nenhum resultado.</p>
          ) : (
            matches.map((m) => (
              <button
                type="button"
                key={`${m.pipelineId}-${m.lead.id}`}
                // onMouseDown roda antes do blur do input → o clique registra.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(m)
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/[0.16] text-[12.5px] font-semibold text-primary-text">
                  {getInitials(m.lead.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-foreground">
                    {m.lead.name}
                  </span>
                  <span className="block truncate text-xs tabular-nums text-muted-foreground">
                    {m.pipelineName} › {m.stageName}
                    {m.lead.phone ? ` · ${m.lead.phone}` : ''}
                    {m.lead.email ? ` · ${m.lead.email}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
