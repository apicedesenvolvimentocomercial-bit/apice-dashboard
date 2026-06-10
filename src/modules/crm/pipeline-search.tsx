'use client'

import { Loader2, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
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
 * feat6 — Busca global de leads/pacientes em TODAS as pipelines de uma vez.
 * SERVER-SIDE (M1 do plano de correções): o board agora é paginado por coluna,
 * então a busca em memória só veria a 1ª página. Debounce de 250ms; casa por
 * nome, telefone (dígitos) ou e-mail.
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
    <div className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
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
          placeholder="Buscar em todas as pipelines (nome, telefone, e-mail)..."
          className="pl-8 pr-8"
          aria-label="Buscar leads em todas as pipelines"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-lg">
          {searching ? (
            <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
            </p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado.</p>
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
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span className="font-medium">{m.lead.name}</span>
                <span className="text-xs text-muted-foreground">
                  {m.pipelineName} › {m.stageName}
                  {m.lead.phone ? ` · ${m.lead.phone}` : ''}
                  {m.lead.email ? ` · ${m.lead.email}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
