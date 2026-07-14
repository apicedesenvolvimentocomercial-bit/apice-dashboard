'use client'

import { AlertTriangle, CheckSquare, ChevronRight, Folder, Plus } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { markClinicActivitiesSeenAction } from '@/domains/clinic/activities/activity-actions'
import { cn } from '@/lib/utils'
import { folderColor } from '@/components/shared/activities/folder-colors'
import type { ActivityView, ActivityView_Counts } from '@/components/shared/activities/types'

import { ClinicActivityRow } from './clinic-activity-row'
import { ClinicCreateActivityDialog } from './clinic-create-activity-dialog'

/**
 * Página de Atividades do DOMÍNIO CLÍNICA — redesign Senno
 * (prompt/Senno Redesign/Atividades/atividades-handoff.md):
 * chip de pastas com roll-out no hover (§4) → abas underline com indicador
 * MEDIDO + "Nova atividade" no conteúdo (§5) → banner de atrasadas com halo
 * pulsante (§6) → lista num único card (§7) ou vazio tracejado (§9.2).
 *
 * Semântica preservada da tela anterior: pastas = membros da clínica
 * (`?userId`), abas = `?view`, contadores do servidor, marcação de "visto".
 */
type View = 'today' | 'week' | 'overdue' | 'all' | 'done'

const TABS: { key: View; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Esta semana' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'all', label: 'Todas' },
  { key: 'done', label: 'Feitas' },
]

type Member = { id: string; name: string }

type Props = {
  activities: ActivityView[]
  counts: ActivityView_Counts
  view: View
  members: Member[]
  currentUserId: string
  selectedUserId: string | null
  activityCalendarSync?: 'AUTO' | 'ASK' | 'NEVER'
  // Etapa 3 / lacuna 3: pode delegar a outros / fan-out "Todos". Quando false,
  // o seletor de responsável e o fan-out somem (só cria atividade pra si).
  canAssignOthers?: boolean
}

export function ClinicActivitiesPage({
  activities,
  counts,
  view,
  members,
  currentUserId,
  selectedUserId,
  activityCalendarSync = 'ASK',
  canAssignOthers = false,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Marca como visto as atividades atribuídas ao próprio usuário ainda não
  // vistas. O backend re-checa o vínculo (clientId+assignee), então é seguro.
  useEffect(() => {
    const unseenIds = activities
      .filter((a) => a.assignedTo?.id === currentUserId && a.seenByAssigneeAt === null)
      .map((a) => a.id)
    if (unseenIds.length === 0) return
    const t = setTimeout(() => {
      void markClinicActivitiesSeenAction(unseenIds)
    }, 800)
    return () => clearTimeout(t)
  }, [activities, currentUserId])

  function setView(v: View) {
    const sp = new URLSearchParams(params.toString())
    sp.set('view', v)
    router.push(`${pathname}?${sp.toString()}`)
  }

  function setUserFolder(userId: string | null) {
    const sp = new URLSearchParams(params.toString())
    sp.set('userId', userId ?? 'all')
    router.push(`${pathname}?${sp.toString()}`)
  }

  // ---- Indicador da aba ativa (underline 2px MEDIDO — §5.1) ----
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState({ left: 0, width: 0, ready: false })
  const measure = useCallback(() => {
    const bar = tabBarRef.current
    const active = bar?.querySelector<HTMLElement>('[data-tab-active="1"]')
    if (!active) return
    setInd({ left: active.offsetLeft, width: active.offsetWidth, ready: true })
  }, [])
  useEffect(() => {
    measure()
    // Re-mede quando a fonte terminar de carregar (largura das abas muda).
    document.fonts?.ready.then(measure).catch(() => {})
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, view, counts])

  const showFolders = members.length > 1
  const defaultAssigneeId = selectedUserId ?? currentUserId ?? members[0]?.id ?? ''

  const orderedMembers = [...members].sort((a, b) => {
    if (a.id === currentUserId) return -1
    if (b.id === currentUserId) return 1
    return a.name.localeCompare(b.name)
  })

  type Chip = { key: string; label: string; dot: string; userId: string | null }
  const chips: Chip[] = [
    ...orderedMembers.map((u) => {
      const isCurrent = u.id === currentUserId
      return {
        key: u.id,
        label: isCurrent ? `${u.name} (você)` : u.name,
        dot: folderColor(u.id, isCurrent).dot,
        userId: u.id as string | null,
      }
    }),
    { key: 'all', label: 'Todos', dot: 'hsl(var(--muted-foreground))', userId: null },
  ]
  const selectedChip = chips.find((c) => c.userId === selectedUserId) ?? chips[chips.length - 1]
  const restChips = chips.filter((c) => c.key !== selectedChip.key)

  const showOverdueBanner = counts.overdue > 0 && view !== 'overdue' && view !== 'done'
  const isEmpty = activities.length === 0
  const inTodosFolder = selectedUserId === null

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Filtro de pastas / cargos (chip com roll-out — §4) ---- */}
      {showFolders && (
        <div className="senno-pastas mb-2 self-start">
          <FolderChip chip={selectedChip} selected onSelect={() => {}} />
          <div className="senno-pastas-rest">
            <div className="senno-pastas-rest-inner">
              {restChips.map((c) => (
                <FolderChip
                  key={c.key}
                  chip={c}
                  selected={false}
                  onSelect={() => setUserFolder(c.userId)}
                />
              ))}
            </div>
          </div>
          <span className="senno-pastas-trigger">
            <Folder className="h-[15px] w-[15px] text-primary-text" aria-hidden="true" />
            Pastas
            <ChevronRight
              className="senno-pastas-chev h-[13px] w-[13px] text-muted-foreground"
              aria-hidden="true"
            />
          </span>
        </div>
      )}

      {/* ---- Abas + botão "Nova atividade" (§5) ---- */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 overflow-x-auto">
          <div
            ref={tabBarRef}
            className="relative flex w-max items-center gap-1 border-b border-border"
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
              const isActive = view === t.key
              const count = counts[t.key]
              const isOver = t.key === 'overdue' && count > 0
              return (
                <button
                  key={t.key}
                  type="button"
                  data-tab-active={isActive ? '1' : undefined}
                  onClick={() => setView(t.key)}
                  className={cn(
                    '-mb-px inline-flex items-center gap-[7px] whitespace-nowrap border-b-2 border-transparent px-3 py-[9px] text-[13.5px] font-semibold transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      'min-w-[18px] rounded-full px-1.5 py-px text-center text-[10.5px] font-semibold tabular-nums',
                      isOver
                        ? 'bg-destructive/[0.15] text-destructive'
                        : isActive
                          ? 'bg-primary/[0.16] text-primary-text'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <ClinicCreateActivityDialog
          members={members}
          defaultAssigneeId={defaultAssigneeId}
          allowFanOut={canAssignOthers}
          activityCalendarSync={activityCalendarSync}
          trigger={
            <button
              type="button"
              className="inline-flex h-9 flex-none items-center gap-[7px] rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
              Nova atividade
            </button>
          }
        />
      </div>

      {/* ---- Banner de atrasada (§6) ---- */}
      {showOverdueBanner && (
        <div className="flex items-center gap-6 rounded-[11px] border border-destructive/30 bg-destructive/[0.09] py-[9px] pl-[18px] pr-3 shadow-card">
          <span className="senno-overdue-ico flex h-7 w-7 flex-none translate-x-[5px] items-center justify-center rounded-lg bg-destructive">
            <AlertTriangle
              className="h-[15px] w-[15px] -translate-y-px text-[hsl(0_0%_100%)]"
              aria-hidden="true"
            />
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2">
            <span className="text-[12.5px] font-bold text-destructive">
              {counts.overdue === 1
                ? '1 atividade atrasada'
                : `${counts.overdue} atividades atrasadas`}
            </span>
            <span className="text-[11.5px] text-destructive/80">
              Precisa de atenção para não impactar o atendimento.
            </span>
          </span>
          <button
            type="button"
            onClick={() => setView('overdue')}
            className="h-7 flex-none rounded-[7px] bg-destructive px-3 text-xs font-semibold text-destructive-foreground transition-[filter] hover:brightness-[1.08]"
          >
            Ver atrasadas
          </button>
        </div>
      )}

      {/* ---- Lista (§7) ou vazio composto (§9.2) ---- */}
      {isEmpty ? (
        <div className="flex flex-col items-center gap-[11px] rounded-[13px] border border-dashed border-border bg-card px-6 py-[46px] text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-muted text-muted-foreground">
            <CheckSquare className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="text-sm font-semibold">Nenhuma atividade neste filtro</div>
          <p className="-mt-1 max-w-[320px] text-[12.5px] text-muted-foreground">
            Quando houver tarefas, reuniões ou ligações aqui, elas aparecem nesta lista.
          </p>
          <button
            type="button"
            onClick={() => setView('all')}
            className="mt-1.5 h-9 rounded-[9px] border border-input bg-background px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Ver todas
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
          {activities.map((a) => {
            const isBroadcastInTodos = a.broadcastId !== null && inTodosFolder
            const assigneeSuffix = inTodosFolder
              ? isBroadcastInTodos
                ? 'Todos'
                : a.assignedTo
                  ? a.assignedTo.id === currentUserId
                    ? `${a.assignedTo.name} (você)`
                    : a.assignedTo.name
                  : null
              : null
            const isNewForViewer =
              a.seenByAssigneeAt === null &&
              a.assignedTo?.id === currentUserId &&
              a.createdBy?.id !== currentUserId
            return (
              <ClinicActivityRow
                key={a.id}
                activity={a}
                assigneeSuffix={assigneeSuffix}
                isNewForViewer={isNewForViewer}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Chip de pasta (§4.1): selecionado = dourado; demais = dot na cor do membro. */
function FolderChip({
  chip,
  selected,
  onSelect,
}: {
  chip: { label: string; dot: string }
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        onSelect()
        e.currentTarget.blur() // fecha o roll-out após escolher
      }}
      className={cn(
        'inline-flex flex-none cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-full border border-transparent px-[13px] py-1.5 text-[12.5px] transition-colors',
        selected
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'font-medium text-foreground hover:bg-accent'
      )}
    >
      <span
        className="h-[7px] w-[7px] flex-none rounded-full"
        style={{ background: selected ? 'hsl(var(--primary-foreground))' : chip.dot }}
        aria-hidden="true"
      />
      {chip.label}
    </button>
  )
}
