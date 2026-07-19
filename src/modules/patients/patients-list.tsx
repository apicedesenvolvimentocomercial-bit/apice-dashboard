'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ClientCard } from '@/components/clinic/client-card/client-card'
import { ActionButton } from '@/components/ui/action-button'
import { cn, getInitials } from '@/lib/utils'
import type { PatientWithStats } from '@/server/repositories/patient-repository'

import { CreatePatientDialog } from './create-patient-dialog'

// "Inativo" = sem atividade há mais tempo que este corte. Espelha o default de
// `Client.winbackDays` (retenção → bucket "Salvamento/Inativos"). É uma derivação
// de UI p/ as abas — não substitui o cálculo exato do cron de retenção.
const INACTIVE_AFTER_DAYS = 120
const PAGE_SIZE = 12

type TabKey = 'todos' | 'ativos' | 'inativos'
type TagKind = 'vip' | 'plano' | 'recorrente' | 'danger' | 'muted'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'ativos', label: 'Ativos' },
  { key: 'inativos', label: 'Inativos' },
]

/** Estilo da pill de tag por tipo (handoff §6). */
const TAG_CLASS: Record<TagKind, string> = {
  vip: 'bg-primary/[0.16] text-primary-text',
  plano: 'border border-primary/45 text-primary-text',
  recorrente: 'bg-ok-bg text-ok',
  danger: 'bg-destructive/[0.12] text-destructive',
  muted: 'bg-muted text-muted-foreground',
}

/** Mapeia uma tag livre da clínica p/ um dos 5 tipos visuais (fallback neutro). */
function tagKind(tag: string): TagKind {
  const t = tag.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (t.includes('vip')) return 'vip'
  if (t.includes('plano')) return 'plano'
  if (t.includes('recorr')) return 'recorrente'
  if (t.includes('inadimpl') || t.includes('devedor') || t.includes('atrasad')) return 'danger'
  if (t.includes('inativ')) return 'muted'
  return 'muted'
}

/** Data de referência p/ status: última visita, senão 1ª visita, senão criação. */
function isInactive(p: PatientWithStats): boolean {
  const ref = p.lastVisitAt ?? p.firstVisitAt ?? p.createdAt
  const days = (Date.now() - new Date(ref).getTime()) / 86_400_000
  return days > INACTIVE_AFTER_DAYS
}

function fmtDate(d: Date | string | null): string {
  return d ? format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }) : '—'
}

// Mesmo grid no cabeçalho e nas linhas p/ alinhar as colunas (handoff §5.1).
const GRID =
  'grid grid-cols-[minmax(0,2.3fr)_minmax(0,1.9fr)_112px_112px_92px_minmax(0,1.7fr)] items-center gap-4'

type Props = {
  patients: PatientWithStats[]
  clientId: string
}

/**
 * Aba Pacientes — redesign Senno (prompt/Senno Redesign/Pacientes): abas de
 * segmento Todos/Ativos/Inativos com underline dourado MEDIDO + contadores (§4),
 * "Novo paciente" no conteúdo (não no header — o chrome já tem "Novo lead"),
 * tabela num card com avatar/tags/pill de agendamentos (§5-6), paginação
 * client-side (§7) e vazio composto (§8). Row → drawer unificado (ClientCard).
 *
 * O chrome (título, busca, tema, sino) vive no topbar/layout — aqui só o corpo.
 */
export function PatientsList({ patients, clientId }: Props) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [drawerPatientId, setDrawerPatientId] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('todos')
  const [page, setPage] = useState(1)

  const inactiveSet = useMemo(
    () => new Set(patients.filter(isInactive).map((p) => p.id)),
    [patients]
  )

  const counts = useMemo(
    () => ({
      todos: patients.length,
      ativos: patients.length - inactiveSet.size,
      inativos: inactiveSet.size,
    }),
    [patients.length, inactiveSet.size]
  )

  const filtered = useMemo(() => {
    if (tab === 'ativos') return patients.filter((p) => !inactiveSet.has(p.id))
    if (tab === 'inativos') return patients.filter((p) => inactiveSet.has(p.id))
    return patients
  }, [patients, tab, inactiveSet])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * PAGE_SIZE
  const rows = filtered.slice(start, start + PAGE_SIZE)

  function selectTab(key: TabKey) {
    setTab(key)
    setPage(1)
  }

  // ---- Indicador da aba ativa (underline 2px MEDIDO — handoff §4.1) ----
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState({ left: 0, width: 0, ready: false })
  const measure = useCallback(() => {
    const active = tabBarRef.current?.querySelector<HTMLElement>('[data-tab-active="1"]')
    if (!active) return
    setInd({ left: active.offsetLeft, width: active.offsetWidth, ready: true })
  }, [])
  useEffect(() => {
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, tab, patients])

  const hasRows = rows.length > 0
  const baseEmpty = patients.length === 0

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Abas + ação da página (handoff §4) ---- */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 overflow-x-auto">
          <div
            ref={tabBarRef}
            className="relative flex w-max items-center gap-1 border-b border-border"
            role="tablist"
            aria-label="Filtrar pacientes por status"
          >
            <span
              className="pointer-events-none absolute bottom-[-1px] left-0 h-0.5 rounded-[2px] bg-primary transition-[transform,width,opacity] duration-320 ease-senno"
              style={{
                width: ind.width,
                transform: `translateX(${ind.left}px)`,
                opacity: ind.ready ? 1 : 0,
              }}
              aria-hidden="true"
            />
            {TABS.map((t) => {
              const isActive = tab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-tab-active={isActive ? '1' : undefined}
                  onClick={() => selectTab(t.key)}
                  className={cn(
                    '-mb-px inline-flex items-center gap-[7px] whitespace-nowrap border-b-2 border-transparent px-3 py-[9px] text-[13.5px] font-semibold transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      'min-w-[18px] rounded-full px-1.5 py-px text-center text-[10.5px] font-semibold tabular-nums',
                      isActive
                        ? 'bg-primary/[0.16] text-primary-text'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {counts[t.key]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <ActionButton onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          Novo paciente
        </ActionButton>
      </div>

      {/* ---- Tabela (handoff §5) ou vazio composto (§8) ---- */}
      {hasRows ? (
        <div className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
          {/* cabeçalho */}
          <div
            className={cn(
              GRID,
              'border-b border-border bg-muted/40 px-5 py-[11px] text-[11.5px] font-semibold uppercase tracking-[0.02em] text-muted-foreground'
            )}
          >
            <div>Paciente</div>
            <div>E-mail</div>
            <div>1ª visita</div>
            <div>Última visita</div>
            <div className="text-center">Agend.</div>
            <div>Tags</div>
          </div>

          {/* linhas */}
          {rows.map((p) => {
            const inactive = inactiveSet.has(p.id)
            const count = p._count.appointments
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => setDrawerPatientId(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setDrawerPatientId(p.id)
                  }
                }}
                className={cn(
                  GRID,
                  'cursor-pointer border-t border-border px-5 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                )}
              >
                {/* Paciente */}
                <div className="flex min-w-0 items-center gap-[11px]">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/[0.16] text-xs font-semibold text-primary-text">
                    {getInitials(p.name)}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        'truncate text-[13.5px] font-semibold leading-[1.25]',
                        inactive ? 'text-muted-foreground' : 'text-foreground'
                      )}
                    >
                      {p.name}
                    </div>
                    <div className="text-[11.5px] tabular-nums leading-[1.25] text-muted-foreground">
                      {p.phone ?? '—'}
                    </div>
                  </div>
                </div>

                {/* E-mail */}
                <div className="truncate text-[12.5px] text-muted-foreground">{p.email ?? '—'}</div>

                {/* 1ª visita */}
                <div className="text-[12.5px] tabular-nums text-foreground">
                  {fmtDate(p.firstVisitAt)}
                </div>

                {/* Última visita */}
                <div
                  className={cn(
                    'text-[12.5px] tabular-nums',
                    inactive ? 'text-muted-foreground' : 'text-foreground'
                  )}
                >
                  {fmtDate(p.lastVisitAt)}
                </div>

                {/* Agend. */}
                <div className="flex justify-center">
                  <span
                    className={cn(
                      'min-w-[26px] rounded-full px-[9px] py-0.5 text-center text-xs font-semibold tabular-nums',
                      count > 0
                        ? 'bg-primary/[0.14] text-primary-text'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {count}
                  </span>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className={cn(
                        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] py-1 text-[11px] font-semibold leading-none',
                        TAG_CLASS[tagKind(tag)]
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                  {p.tags.length > 2 && (
                    <span className="inline-flex items-center rounded-full bg-muted px-[9px] py-1 text-[11px] font-semibold leading-none text-muted-foreground">
                      +{p.tags.length - 2}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {/* rodapé / paginação (handoff §7) */}
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-[11px]">
            <span className="text-xs tabular-nums text-muted-foreground">
              Mostrando {filtered.length === 0 ? 0 : start + 1}–{start + rows.length} de{' '}
              {filtered.length}
            </span>
            <div className="flex items-center gap-[7px]">
              <button
                type="button"
                onClick={() => setPage((n) => Math.max(1, n - 1))}
                disabled={safePage <= 1}
                aria-label="Página anterior"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground/50 disabled:hover:bg-card"
              >
                <ChevronLeft className="h-[15px] w-[15px]" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setPage((n) => Math.min(pageCount, n + 1))}
                disabled={safePage >= pageCount}
                aria-label="Próxima página"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground/50 disabled:hover:bg-card"
              >
                <ChevronRight className="h-[15px] w-[15px]" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-[11px] rounded-[13px] border border-dashed border-border bg-card px-6 py-[46px] text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-muted text-muted-foreground">
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="text-sm font-semibold">
            {baseEmpty ? 'Nenhum paciente cadastrado' : 'Nenhum paciente neste filtro'}
          </div>
          <p className="-mt-1 max-w-[330px] text-[12.5px] text-muted-foreground">
            {baseEmpty
              ? 'Pacientes ganhos no funil aparecem aqui automaticamente. Cadastre um novo paciente para começar a montar a base da clínica.'
              : 'Ajuste o filtro ou cadastre um novo paciente para começar a montar a base da clínica.'}
          </p>
          {baseEmpty ? (
            <ActionButton className="mt-1.5" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              Cadastrar paciente
            </ActionButton>
          ) : (
            <button
              type="button"
              onClick={() => selectTab('todos')}
              className="mt-1.5 h-9 rounded-[9px] border border-input bg-background px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Ver todos
            </button>
          )}
        </div>
      )}

      <CreatePatientDialog
        open={createOpen}
        clientId={clientId}
        onOpenChange={setCreateOpen}
        onCreated={() => router.refresh()}
      />

      <ClientCard
        open={drawerPatientId !== null}
        clientId={clientId}
        subject={drawerPatientId ? { type: 'patient', id: drawerPatientId } : null}
        onClose={() => setDrawerPatientId(null)}
        onChanged={() => {
          setDrawerPatientId(null)
          router.refresh()
        }}
      />
    </div>
  )
}
