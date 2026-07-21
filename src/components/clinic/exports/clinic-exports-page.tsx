'use client'

import {
  Activity,
  AlertTriangle,
  Banknote,
  Calendar,
  Coins,
  Download,
  FileText,
  Filter,
  Grid3x3,
  Loader2,
  Receipt,
  Syringe,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DateInput } from '@/components/ui/date-input'
import { cn } from '@/lib/utils'

/**
 * Tela Exportações — redesign Senno (prompt/Senno Redesign/Exportações):
 * barra de Período (tile dourado + De/Até + segmented de presets com pílula
 * deslizante, §4/§9) sobre a grade `auto-fit minmax(322px,1fr)` de cards
 * (§5–§7). O h1 vive no topbar (chrome do layout), não aqui.
 *
 * Desvios documentados vs. protótipo:
 * - `descHint` (texto após o travessão) NÃO é renderizado — só `descMain`,
 *   como no protótipo (handoff §6.2; decisão: sem linha secundária).
 * - `scope` virou UI (handoff §7 pedia surfacear): chip "Período" /
 *   "Base completa" no rodapé de cada card, derivado de `supportsRange`.
 * - Excel ganhou feedback próprio de "Gerando…" (corrige a inconsistência
 *   apontada no handoff §8.3 — no protótipo o botão era estático).
 * - Download real via fetch+blob: sucesso = toast discreto; erro = caixa
 *   inline no card com "Tentar novamente" (handoff §10 — nunca alert()).
 * - Card primário SEM destaque estático (decisão de produto 2026-07-14,
 *   diverge do handoff §6/§12): o dourado que era só do `exec` (borda +
 *   tile do ícone) virou o estado de HOVER de todos os cards. CTA segue
 *   ghost (§8.1).
 * - Micro-hint "Sem dados no período" (§10, recomendado) ficou de fora —
 *   exigiria contagem por dataset no servidor; a exportação vazia funciona.
 *
 * A lista de cards já vem FILTRADA pelo servidor (só módulos que o cargo lê)
 * e a rota de export re-valida a permissão.
 */

export type ExportResourceItem = {
  key: string
  label: string
  description: string
  supportsRange: boolean
}

type ExportFormat = 'pdf' | 'csv' | 'xlsx'

type CardDef = ExportResourceItem & {
  icon: LucideIcon
  formats: ExportFormat[]
}

// Ícones por dataset (handoff §7 — mesmo set stroke-24 da sidebar).
const RESOURCE_ICONS: Record<string, LucideIcon> = {
  leads: Filter,
  patients: Users,
  appointments: Calendar,
  revenues: Banknote,
  costs: Coins,
  receivables: Receipt,
  procedures: Syringe,
  activities: Activity,
  goals: Target,
}

const PRESETS = [
  { key: 'mes', label: 'Este mês' },
  { key: 'passado', label: 'Mês passado' },
  { key: '90d', label: 'Últimos 90 dias' },
  { key: 'tudo', label: 'Tudo' },
] as const

type PresetKey = (typeof PRESETS)[number]['key']

type PeriodFilter = { from: string; to: string; preset: PresetKey | '' }

function fmtISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Faixa de cada preset (handoff §9). "Tudo" seleciona a pílula mas zera as
// datas (sem filtro de período).
function presetRange(k: PresetKey): Pick<PeriodFilter, 'from' | 'to'> {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  if (k === 'mes') return { from: fmtISO(new Date(y, m, 1)), to: fmtISO(now) }
  if (k === 'passado') return { from: fmtISO(new Date(y, m - 1, 1)), to: fmtISO(new Date(y, m, 0)) }
  if (k === '90d')
    return { from: fmtISO(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)), to: fmtISO(now) }
  return { from: '', to: '' }
}

export function ClinicExportsPage({
  clientId,
  resources,
  canFinancialReport,
}: {
  clientId: string
  resources: ExportResourceItem[]
  canFinancialReport: boolean
}) {
  const [filter, setFilter] = useState<PeriodFilter>({ from: '', to: '', preset: '' })
  // Ocupado por AÇÃO (`key:format`) — CSV e Excel do mesmo card são
  // independentes (handoff §8). Erro é por CARD (guarda o formato que falhou
  // p/ o "Tentar novamente").
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, ExportFormat>>({})

  const cards: CardDef[] = [
    ...(canFinancialReport
      ? [
          {
            key: 'exec',
            label: 'Relatório executivo (PDF)',
            description: 'KPIs, top procedimentos, custos e metas do período',
            supportsRange: true,
            icon: FileText,
            formats: ['pdf'] as ExportFormat[],
          },
        ]
      : []),
    ...resources.map((r) => ({
      ...r,
      icon: RESOURCE_ICONS[r.key] ?? FileText,
      formats: ['csv', 'xlsx'] as ExportFormat[],
    })),
  ]

  // Toggle no preset ativo limpa tudo; escolher outro aplica a faixa (§9).
  function applyPreset(k: PresetKey) {
    if (filter.preset === k) {
      setFilter({ from: '', to: '', preset: '' })
      return
    }
    setFilter({ ...presetRange(k), preset: k })
  }

  function urlFor(card: CardDef, format: ExportFormat): string {
    if (format === 'pdf') {
      const params = new URLSearchParams()
      if (filter.from && filter.to) {
        params.set('from', filter.from)
        params.set('to', filter.to)
      }
      const qs = params.toString()
      return `/api/reports/${clientId}/pdf${qs ? `?${qs}` : ''}`
    }
    const params = new URLSearchParams({ format })
    if (card.supportsRange) {
      if (filter.from) params.set('from', filter.from)
      if (filter.to) params.set('to', filter.to)
    }
    return `/api/export/${clientId}/${card.key}?${params.toString()}`
  }

  async function download(card: CardDef, format: ExportFormat) {
    const busyKey = `${card.key}:${format}`
    if (busy[busyKey]) return
    setBusy((prev) => ({ ...prev, [busyKey]: true }))
    setErrors((prev) => {
      if (!(card.key in prev)) return prev
      const next = { ...prev }
      delete next[card.key]
      return next
    })
    try {
      const res = await fetch(urlFor(card, format))
      if (!res.ok) throw new Error(`export failed: ${res.status}`)
      const blob = await res.blob()
      const match = (res.headers.get('Content-Disposition') ?? '').match(/filename="([^"]+)"/)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = match?.[1] ?? `${card.key}.${format}`
      link.click()
      URL.revokeObjectURL(link.href)
      toast.success('Arquivo gerado')
    } catch {
      setErrors((prev) => ({ ...prev, [card.key]: format }))
    } finally {
      setBusy((prev) => {
        const next = { ...prev }
        delete next[busyKey]
        return next
      })
    }
  }

  const presetIdx = PRESETS.findIndex((p) => p.key === filter.preset)

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Barra de Período (handoff §4) ---- */}
      <div className="flex flex-wrap items-center gap-3 rounded-[13px] border border-border bg-card px-5 py-[18px] shadow-card">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-primary/[0.14] text-primary-text">
          <Calendar className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>
        <div className="flex-none text-base font-semibold">Período</div>

        <div className="ml-auto flex flex-wrap items-end gap-[18px]">
          <div className="flex gap-3.5">
            {/* Rótulo associado por `htmlFor` (não envolvendo o campo): o
                DateInput traz o botão do calendário, e um <button> dentro de
                <label> faz o clique ser reencaminhado ao input. */}
            {(['from', 'to'] as const).map((field) => (
              <div key={field} className="flex flex-col gap-[5px]">
                <label
                  htmlFor={`export-period-${field}`}
                  className="text-[11.5px] font-semibold text-muted-foreground"
                >
                  {field === 'from' ? 'De' : 'Até'}
                </label>
                <DateInput
                  id={`export-period-${field}`}
                  value={filter[field]}
                  // Editar a data manualmente limpa o preset — campos e
                  // segmented são mutuamente exclusivos como fonte (§9).
                  onChange={(e) => setFilter({ ...filter, [field]: e.target.value, preset: '' })}
                  containerClassName="w-40"
                  className="h-[38px] w-full rounded-[9px] border-input bg-background px-3 text-[13px] tabular-nums text-foreground shadow-none transition-shadow focus-visible:border-ring focus-visible:ring-0 focus-visible:[box-shadow:0_0_0_3px_hsl(var(--ring)/0.18)]"
                />
              </div>
            ))}
          </div>

          {/* Segmented dourado com pílula deslizante; nenhum preset
              selecionado por padrão → pílula oculta (§4.2b). */}
          <div
            className="relative grid auto-cols-fr grid-flow-col rounded-[9px] border border-border bg-muted p-[3px]"
            role="group"
            aria-label="Presets de período"
          >
            <div
              className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] z-0 rounded-[7px] bg-primary shadow-card"
              style={{
                width: `calc((100% - 6px) / ${PRESETS.length})`,
                transform: `translateX(${presetIdx * 100}%)`,
                opacity: presetIdx < 0 ? 0 : 1,
                transition: 'transform .34s cubic-bezier(.34,1.1,.5,1), opacity .2s ease',
              }}
              aria-hidden="true"
            />
            {PRESETS.map((p) => {
              const active = filter.preset === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyPreset(p.key)}
                  className={cn(
                    'relative z-[1] whitespace-nowrap rounded-[7px] px-3.5 py-[7px] text-[12.5px] font-semibold transition-colors duration-250',
                    active
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:bg-primary/[0.22] hover:text-primary-text'
                  )}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ---- Grade de exportações (handoff §5) ---- */}
      {cards.length > 0 ? (
        <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(322px,1fr))]">
          {cards.map((card) => (
            <ExportCard
              key={card.key}
              card={card}
              busy={busy}
              errorFormat={errors[card.key]}
              onDownload={download}
            />
          ))}
        </div>
      ) : (
        // Vazio composto (design.md §5) — cargo sem leitura de nenhum dataset.
        <div className="flex flex-col items-center gap-3 rounded-[15px] border border-dashed border-border bg-card px-6 py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Download className="h-[23px] w-[23px]" aria-hidden="true" />
          </div>
          <p className="m-0 text-[15px] font-semibold">Nada para exportar</p>
          <p className="m-0 max-w-sm text-[13px] leading-[1.55] text-muted-foreground">
            Seu cargo não tem acesso de leitura a nenhum dado exportável. Fale com o titular da
            clínica para liberar os módulos.
          </p>
        </div>
      )}
    </div>
  )
}

// ---- Card de exportação (handoff §6–§8) ----

const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'Baixar PDF',
  csv: 'CSV',
  xlsx: 'Excel',
}

function ExportCard({
  card,
  busy,
  errorFormat,
  onDownload,
}: {
  card: CardDef
  busy: Record<string, boolean>
  errorFormat: ExportFormat | undefined
  onDownload: (card: CardDef, format: ExportFormat) => void
}) {
  const Icon = card.icon
  return (
    // Hover dourado padrão (decisão de produto 2026-07-14): borda + tile do
    // ícone acendem em TODOS os cards — era o destaque estático do `exec`.
    // `primary/45` (tom do protótipo p/ o exec), NÃO /50: o override global
    // `.dark .hover\:border-primary\/50` (globals.css) neutralizaria o dourado
    // no dark — aqui ele foi pedido explicitamente nos dois temas.
    <div className="group relative flex min-h-[196px] flex-col gap-4 rounded-[15px] border border-border bg-card p-6 pb-[22px] shadow-card transition-colors hover:border-primary/45">
      <div className="flex items-center gap-[13px]">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/[0.16] group-hover:text-primary-text">
          <Icon className="h-[23px] w-[23px]" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 text-lg font-semibold leading-[1.25]">{card.label}</div>
      </div>

      <p className="m-0 flex-1 text-[13.5px] leading-[1.55] text-muted-foreground">
        {card.description}
      </p>

      {errorFormat && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 flex-none text-destructive" aria-hidden="true" />
          <span className="flex-1 text-[12.5px] text-destructive">
            Não foi possível gerar o arquivo.
          </span>
          <button
            type="button"
            onClick={() => onDownload(card, errorFormat)}
            className="inline-flex h-8 items-center rounded-lg border border-destructive/40 bg-background px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        {card.formats.map((format) => {
          const isBusy = !!busy[`${card.key}:${format}`]
          const ActionIcon = isBusy ? Loader2 : format === 'xlsx' ? Grid3x3 : Download
          return (
            <button
              key={format}
              type="button"
              disabled={isBusy}
              onClick={() => onDownload(card, format)}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-background px-4 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-70 disabled:hover:bg-background"
            >
              <ActionIcon className={cn('h-4 w-4', isBusy && 'animate-spin')} aria-hidden="true" />
              {isBusy ? 'Gerando…' : FORMAT_LABELS[format]}
            </button>
          )
        })}
        {/* Chip de escopo — surfaceia o `scope` do handoff §7 (não deixar
            implícito se o card respeita ou ignora a barra de Período). */}
        <span
          className="ml-auto whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
          title={
            card.supportsRange
              ? 'Respeita o período selecionado acima; vazio = histórico completo'
              : 'Exporta a base inteira — ignora o período selecionado'
          }
        >
          {card.supportsRange ? 'Período' : 'Base completa'}
        </span>
      </div>
    </div>
  )
}
