'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check, MoreHorizontal, Play, Trash2, X } from 'lucide-react'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteActivityAction, updateActivityStatusAction } from '@/server/actions/activity-actions'

import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_LABEL,
  type ActivityView,
} from './types'

type Props = {
  activity: ActivityView
}

export function ActivityCard({ activity }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const isOverdue =
    activity.dueDate &&
    activity.status !== 'COMPLETED' &&
    activity.status !== 'CANCELED' &&
    new Date(activity.dueDate).getTime() < Date.now()

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
      className={`flex items-start gap-3 rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm ${
        activity.status === 'COMPLETED' ? 'opacity-60' : ''
      } ${isOverdue ? 'border-red-300 dark:border-red-900' : ''}`}
    >
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${activity.status === 'COMPLETED' ? 'line-through' : ''}`}>
            {activity.title}
          </span>
          <Badge variant="outline" className="font-normal">
            {TYPE_LABEL[activity.type]}
          </Badge>
          <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_COLOR[activity.priority]}`}>
            {PRIORITY_LABEL[activity.priority]}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[activity.status]}`}>
            {STATUS_LABEL[activity.status]}
          </span>
          {isOverdue && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              Atrasada
            </span>
          )}
        </div>

        {activity.description && (
          <p className="text-sm text-muted-foreground">{activity.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {activity.dueDate && (
            <span>
              Venc: {format(new Date(activity.dueDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          )}
          {activity.client && <span>Clínica: {activity.client.name}</span>}
          {activity.assignedTo && <span>Resp: {activity.assignedTo.name}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {activity.status !== 'COMPLETED' && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Marcar concluída"
            disabled={pending}
            onClick={() => setStatus('COMPLETED')}
          >
            <Check className="h-4 w-4" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="Ações">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {activity.status === 'PENDING' && (
              <DropdownMenuItem onClick={() => setStatus('IN_PROGRESS')}>
                <Play className="mr-2 h-4 w-4" /> Iniciar
              </DropdownMenuItem>
            )}
            {activity.status !== 'COMPLETED' && (
              <DropdownMenuItem onClick={() => setStatus('COMPLETED')}>
                <Check className="mr-2 h-4 w-4" /> Marcar concluída
              </DropdownMenuItem>
            )}
            {activity.status !== 'CANCELED' && (
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
    </div>
  )
}
