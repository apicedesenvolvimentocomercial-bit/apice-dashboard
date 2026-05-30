'use client'

import { Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import type { PipelineTab } from './pipeline-tabs'

type Match = {
  leadId: string
  leadName: string
  phone: string | null
  email: string | null
  pipelineId: string
  pipelineName: string
  stageName: string
}

type Props = {
  pipelines: PipelineTab[]
  /** Achou e clicou → o pai troca de aba e destaca o card. */
  onSelect: (pipelineId: string, leadId: string) => void
}

const MAX_RESULTS = 25
const onlyDigits = (s: string) => s.replace(/\D/g, '')

/**
 * feat6 — Busca global de leads/pacientes em TODAS as pipelines de uma vez. Os
 * dados já vêm carregados no SSR (≤6 funis), então o filtro roda em memória —
 * instantâneo, sem ida ao servidor. Casa por nome, telefone (dígitos) ou e-mail.
 */
export function PipelineSearch({ pipelines, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const matches = useMemo<Match[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const qDigits = onlyDigits(q)
    const out: Match[] = []
    for (const p of pipelines) {
      for (const stage of p.stages) {
        for (const lead of stage.leads) {
          const byName = lead.name.toLowerCase().includes(q)
          const byEmail = !!lead.email && lead.email.toLowerCase().includes(q)
          const byPhone =
            qDigits.length >= 3 && !!lead.phone && onlyDigits(lead.phone).includes(qDigits)
          if (byName || byEmail || byPhone) {
            out.push({
              leadId: lead.id,
              leadName: lead.name,
              phone: lead.phone,
              email: lead.email,
              pipelineId: p.id,
              pipelineName: p.name,
              stageName: stage.name,
            })
            if (out.length >= MAX_RESULTS) return out
          }
        }
      }
    }
    return out
  }, [query, pipelines])

  const showDropdown = focused && query.trim().length >= 2

  function pick(m: Match) {
    onSelect(m.pipelineId, m.leadId)
    setQuery('')
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
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado.</p>
          ) : (
            matches.map((m) => (
              <button
                type="button"
                key={`${m.pipelineId}-${m.leadId}`}
                // onMouseDown roda antes do blur do input → o clique registra.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(m)
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span className="font-medium">{m.leadName}</span>
                <span className="text-xs text-muted-foreground">
                  {m.pipelineName} › {m.stageName}
                  {m.phone ? ` · ${m.phone}` : ''}
                  {m.email ? ` · ${m.email}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
