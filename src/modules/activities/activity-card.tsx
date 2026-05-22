'use client'

import { format, isSameDay, isTomorrow, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Check,
  CheckSquare,
  Mail,
  MoreHorizontal,
  Phone,
  Play,
  StickyNote,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { deleteActivityAction, updateActivityStatusAction } from '@/server/actions/activity-actions'

import { PRIORITY_LABEL, TYPE_LABEL, type ActivityView } from './types'

type Props = {
  activity: ActivityView
  ownerColor?: string | null
  ownerLabel?: string | null
  /** Quando true, exibe o badge "Nova". */
  isNewForViewer?: boolean
}

const TYPE_ICON: Record<ActivityView['type'], LucideIcon> = {
  TASK: CheckSquare,
  MEETING: Users,
  CALL: Phone,
  EMAIL: Mail,
  NOTE: StickyNote,
}

const PRIORITY_BORDER: Record<ActivityView['priority'], string> = {
  LOW: 'border-l-zinc-300 dark:border-l-zinc-700',
  MEDIUM: 'border-l-amber-500',
  HIGH: 'border-l-red-600',
  URGENT: 'border-l-red-700',
}

const PRIORITY_BADGE: Record<ActivityView['priority'], string> = {
  LOW: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  MEDIUM: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  HIGH: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  URGENT: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-200',
}

function formatDueLabel(d: Date): { time: string; label: string } {
  const now = new Date()
  const time = format(d, 'HH:mm')
  if (isSameDay(d, now)) return { time, label: 'Hoje' }
  if (isTomorrow(d)) return { time, label: 'Amanhã' }
  if (isYesterday(d)) return { time, label: 'Ontem' }
  return { time, label: format(d, "dd 'de' MMM", { locale: ptBR }) }
}

export function ActivityCard({ activity, ownerColor, ownerLabel, isNewForViewer }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const isCompleted = activity.status === 'COMPLETED'
  const isCanceled = activity.status === 'CANCELED'
  const isOverdue =
    activity.dueDate &&
    !isCompleted &&
    !isCanceled &&
    new Date(activity.dueDate).getTime() < Date.now()

  const TypeIcon = TYPE_ICON[activity.type]
  const due = activity.dueDate ? formatDueLabel(new Date(activity.dueDate)) : null

  function setStatus(status: ActivityView['status']) {
    startTransition(async () => {
      const r = await updateActivityStatusAction(activity.id, status)
      if (r.success) {
        toast.success('Atividade atualizada')
        router.refresh()
      } else {
        toast.error(r.error.message)
      }
    })
  }

  function toggleDone() {
    setStatus(isCompleted ? 'PENDING' : 'COMPLETED')
  }

  function remove() {
    if (!confirm('Excluir esta atividade?')) return
    startTransition(async () => {
      const r = await deleteActivityAction(activity.id)
      if (r.success) {
        toast.success('Atividade excluída')
        router.refresh()
      } else {
        toast.error(r.error.message)
      }
    })
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3.5 rounded-xl border border-l-[3px] bg-background px-3.5 py-3 transition-shadow hover:shadow-sm',
        PRIORITY_BORDER[activity.priority],
        isOverdue && 'border-red-300 dark:border-red-900',
        isCompleted && 'opacity-60'
      )}
    >
      {due && (
        <div className="flex min-w-[52px] shrink-0 flex-col items-center border-r pr-3.5">
          <span className="text-lg font-medium tabular-nums leading-none">{due.time}</span>
          <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {due.label}
          </span>
        </div>
      )}

      <button
        type="button"
        aria-label={isCompleted ? 'Marcar como pendente' : 'Concluir tarefa'}
        disabled={pending}
        onClick={toggleDone}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
          isCompleted
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-muted-foreground/40 bg-transparent hover:border-emerald-500 hover:bg-emerald-50'
        )}
      >
        {isCompleted && <Check className="h-3.5 w-3.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {isNewForViewer && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Nova
            </span>
          )}
          <span
            className={cn(
              'text-sm font-medium text-foreground',
              isCompleted && 'line-through',
              isCanceled && 'text-muted-foreground line-through'
            )}
          >
            {activity.title}
          </span>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              PRIORITY_BADGE[activity.priority]
            )}
          >
            {PRIORITY_LABEL[activity.priority]}
          </span>
          {isOverdue && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700 dark:bg-red-950 dark:text-red-300">
              Atrasada
            </span>
          )}
        </div>

        {activity.description && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{activity.description}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {ownerLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: ownerColor ?? '#9A9A93' }}
              />
              {ownerLabel}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <TypeIcon className="h-3.5 w-3.5" /> {TYPE_LABEL[activity.type]}
          </span>
          {activity.createdBy && activity.createdBy.id !== activity.assignedTo?.id && (
            <span className="inline-flex items-center gap-1">por {activity.createdBy.name}</span>
          )}
          {activity.client && (
            <span className="inline-flex items-center gap-1">• {activity.client.name}</span>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Mais opções"
            className="h-8 w-8 shrink-0 text-muted-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {activity.status === 'PENDING' && (
            <DropdownMenuItem onClick={() => setStatus('IN_PROGRESS')}>
              <Play className="mr-2 h-4 w-4" /> Iniciar
            </DropdownMenuItem>
          )}
          {!isCompleted && (
            <DropdownMenuItem onClick={() => setStatus('COMPLETED')}>
              <Check className="mr-2 h-4 w-4" /> Marcar concluída
            </DropdownMenuItem>
          )}
          {!isCanceled && (
            <DropdownMenuItem onClick={() => setStatus('CANCELED')}>
              <X className="mr-2 h-4 w-4" /> Cancelar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-destructive" onClick={remove}>
            <Trash2 className="mr-2 h-4 w-4" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
