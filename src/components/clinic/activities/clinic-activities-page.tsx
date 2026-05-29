'use client'

import { AlertTriangle, Folder } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { markClinicActivitiesSeenAction } from '@/domains/clinic/activities/activity-actions'
import { cn } from '@/lib/utils'
import { folderColor } from '@/components/shared/activities/folder-colors'
import type { ActivityView, ActivityView_Counts } from '@/components/shared/activities/types'

import { ClinicActivityCard } from './clinic-activity-card'
import { ClinicCreateActivityDialog } from './clinic-create-activity-dialog'

/**
 * Página de Atividades do DOMÍNIO CLÍNICA (Fase 3). Espelha o design do painel
 * admin (modules/activities/activities-page) — pastas por membro, fan-out
 * "Todos", diálogo de Nova atividade — mas TODA action/query é de clínica
 * (escopo clientId + domain=CLINIC). Nenhuma informação cruza pro admin.
 *
 * Clínica é colaborativa: qualquer membro vê pastas e pode atribuir/fan-out
 * (membership por clientId, cargo-agnóstico — preparado p/ cargos futuros).
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

  const showFolders = members.length > 1

  const defaultAssigneeId = selectedUserId ?? currentUserId ?? members[0]?.id ?? ''

  const orderedMembers = [...members].sort((a, b) => {
    if (a.id === currentUserId) return -1
    if (b.id === currentUserId) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="rounded-2xl bg-muted/40 p-5 dark:bg-muted/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Atividades</h1>
          <p className="text-sm text-muted-foreground">
            Tarefas, reuniões e ligações da sua clínica
          </p>
        </div>
        <ClinicCreateActivityDialog
          members={members}
          defaultAssigneeId={defaultAssigneeId}
          allowFanOut={canAssignOthers}
          activityCalendarSync={activityCalendarSync}
        />
      </div>

      {showFolders && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Folder className="h-3.5 w-3.5" /> Pastas
          </span>
          {orderedMembers.map((u) => {
            const isCurrent = u.id === currentUserId
            const c = folderColor(u.id, isCurrent)
            return (
              <FolderPill
                key={u.id}
                label={isCurrent ? `${u.name} (você)` : u.name}
                color={c.dot}
                active={selectedUserId === u.id}
                onClick={() => setUserFolder(u.id)}
              />
            )
          })}
          <FolderPill
            label="Todos"
            color="#9A9A93"
            active={!selectedUserId}
            onClick={() => setUserFolder(null)}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => {
          const isActive = view === t.key
          const count = counts[t.key]
          const isOverdue = t.key === 'overdue' && count > 0
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none',
                  isActive && !isOverdue && 'bg-emerald-100 text-emerald-700',
                  isOverdue && 'bg-red-100 text-red-700',
                  !isActive && !isOverdue && 'bg-muted text-muted-foreground'
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {view !== 'overdue' && counts.overdue > 0 && (
        <button
          type="button"
          onClick={() => setView('overdue')}
          className="mt-4 flex w-full items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-left text-sm text-red-900 transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
        >
          <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-300" />
          <span>
            <span className="font-medium">
              {counts.overdue}{' '}
              {counts.overdue === 1 ? 'atividade atrasada' : 'atividades atrasadas'}
            </span>{' '}
            precisando de atenção
          </span>
          <span className="ml-auto text-xs font-medium">Ver →</span>
        </button>
      )}

      <div className="mt-4">
        {activities.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background p-12 text-center text-sm text-muted-foreground">
            Nenhuma atividade neste filtro.
            <div className="mt-3">
              <Button asChild variant="outline" size="sm">
                <Link href="?view=all">Ver todas</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activities.map((a) => {
              const assignee = a.assignedTo
              const isBroadcastInTodos = a.broadcastId !== null && !selectedUserId
              const c = isBroadcastInTodos
                ? { dot: '#9A9A93' }
                : assignee
                  ? folderColor(assignee.id, assignee.id === currentUserId)
                  : null
              const ownerLabel = isBroadcastInTodos
                ? 'Todos'
                : assignee
                  ? assignee.id === currentUserId
                    ? `${assignee.name} (você)`
                    : assignee.name
                  : null
              const isNewForViewer =
                a.seenByAssigneeAt === null &&
                a.assignedTo?.id === currentUserId &&
                a.createdBy?.id !== currentUserId
              return (
                <ClinicActivityCard
                  key={a.id}
                  activity={a}
                  ownerColor={c?.dot ?? null}
                  ownerLabel={ownerLabel}
                  isNewForViewer={isNewForViewer}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FolderPill({
  label,
  color,
  active,
  onClick,
}: {
  label: string
  color: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-transparent text-white shadow-sm'
          : 'border-border bg-background text-foreground hover:bg-accent'
      )}
      style={active ? { backgroundColor: color } : undefined}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: active ? 'rgba(255,255,255,0.95)' : color }}
      />
      {label}
    </button>
  )
}
