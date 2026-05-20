'use client'

import { AlertTriangle, Folder } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { markActivitiesSeenAction } from '@/server/actions/activity-actions'

import { ActivityCard } from './activity-card'
import { CreateActivityDialog } from './create-activity-dialog'
import { folderColor } from './folder-colors'
import { QuickAdd } from './quick-add'
import type { ActivityView, ActivityView_Counts } from './types'

type View = 'today' | 'week' | 'overdue' | 'all' | 'done'

const TABS: { key: View; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Esta semana' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'all', label: 'Todas' },
  { key: 'done', label: 'Feitas' },
]

type Props = {
  activities: ActivityView[]
  counts: ActivityView_Counts
  view: View
  clients: { id: string; name: string }[]
  users: { id: string; name: string }[]
  lockClient?: boolean
  defaultClientId?: string | null
  currentUserId?: string
  isAdmin?: boolean
  selectedUserId?: string | null
  /** Preferência do usuário sobre sync atividade → calendário. */
  activityCalendarSync?: 'AUTO' | 'ASK' | 'NEVER'
}

export function ActivitiesPage({
  activities,
  counts,
  view,
  clients,
  users,
  lockClient,
  defaultClientId,
  currentUserId,
  isAdmin,
  selectedUserId,
  activityCalendarSync = 'ASK',
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Marca como visto somente as atividades atribuídas ao próprio usuário que
  // ainda têm seenByAssigneeAt = null. O backend re-checa esse vínculo, então
  // mandar uma lista "suja" também é seguro.
  useEffect(() => {
    if (!currentUserId) return
    const unseenIds = activities
      .filter((a) => a.assignedTo?.id === currentUserId && a.seenByAssigneeAt === null)
      .map((a) => a.id)
    if (unseenIds.length === 0) return
    // Pequeno atraso evita marcar como visto durante uma navegação relâmpago.
    const t = setTimeout(() => {
      void markActivitiesSeenAction(unseenIds)
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
    if (!userId) sp.delete('userId')
    else sp.set('userId', userId)
    router.push(`${pathname}?${sp.toString()}`)
  }

  // Pré-seleciona o usuário para a nova atividade conforme a pasta aberta.
  // - Admin em pasta de usuário → esse usuário
  // - Admin em "Todos" → o próprio admin (fan-out fica como opção opt-in
  //   "Todos" no select do diálogo, não default)
  // - STAFF / clínica → sempre o próprio usuário
  const defaultAssigneeId = isAdmin
    ? (selectedUserId ?? currentUserId ?? users[0]?.id ?? '')
    : (currentUserId ?? users[0]?.id ?? '')

  // Tarefa rápida em "Todos" do admin faz fan-out (sentinel 'all'), igual
  // a escolher "Todos" no select do diálogo. Em pasta de usuário, cai nele.
  const quickAddAssigneeId = isAdmin ? (selectedUserId ?? 'all') : (currentUserId ?? null)
  const quickAddFolderLabel = (() => {
    if (!isAdmin) return null
    if (!selectedUserId) return 'Todos'
    const u = users.find((x) => x.id === selectedUserId)
    if (!u) return null
    return u.id === currentUserId ? `${u.name} (você)` : u.name
  })()

  // Coloca o usuário atual (admin) na frente da lista de pastas.
  const orderedUsers = isAdmin
    ? [...users].sort((a, b) => {
        if (a.id === currentUserId) return -1
        if (b.id === currentUserId) return 1
        return a.name.localeCompare(b.name)
      })
    : users

  return (
    <div className="rounded-2xl bg-muted/40 p-5 dark:bg-muted/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Atividades</h1>
          <p className="text-sm text-muted-foreground">
            Tarefas, reuniões e ligações organizadas por prioridade e prazo
          </p>
        </div>
        <CreateActivityDialog
          clients={clients}
          users={users}
          lockClient={lockClient}
          defaultClientId={defaultClientId ?? null}
          defaultAssigneeId={defaultAssigneeId}
          allowFanOut={isAdmin}
          activityCalendarSync={activityCalendarSync}
        />
      </div>

      {isAdmin && users.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Folder className="h-3.5 w-3.5" /> Pastas
          </span>
          <FolderPill
            label="Todos"
            color="#9A9A93"
            active={!selectedUserId}
            onClick={() => setUserFolder(null)}
          />
          {orderedUsers.map((u) => {
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
        </div>
      )}

      <div className="mt-4">
        <QuickAdd
          assignedToId={quickAddAssigneeId}
          folderLabel={quickAddFolderLabel}
          activityCalendarSync={activityCalendarSync}
        />
      </div>

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
              // Fan-out exibido no "Todos" do admin colapsa em uma linha
              // única — mostra "Todos" no lugar do nome do responsável.
              const isBroadcastInTodos = a.broadcastId !== null && isAdmin && !selectedUserId
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
              // Mostra "Nova" só para quem é o responsável: o admin abrindo
              // a pasta de outra pessoa não deve ver "Nova" — esse marcador
              // é do ponto de vista do dono da tarefa.
              const isNewForViewer =
                a.seenByAssigneeAt === null &&
                a.assignedTo?.id === currentUserId &&
                a.createdBy?.id !== currentUserId
              return (
                <ActivityCard
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
