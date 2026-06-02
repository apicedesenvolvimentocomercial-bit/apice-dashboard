import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ActivityPriority, ActivityStatus, ActivityType } from '@prisma/client'

import { cn } from '@/lib/utils'
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_LABEL,
  activityTypeLabel,
} from '@/components/shared/activities/types'

/**
 * Visão READ-ONLY das atividades da clínica para o ADMIN (em
 * `clients/[clientId]/atividades`). Server component — sem actions: o admin
 * NÃO opera as atividades da clínica, só observa (reforma divisão total).
 */
type Row = {
  id: string
  title: string
  description: string | null
  type: ActivityType
  customTypeLabel?: string | null
  status: ActivityStatus
  priority: ActivityPriority
  dueDate: Date | null
  assignedTo: { id: string; name: string; image: string | null } | null
}

export function ClientClinicActivities({ activities }: { activities: Row[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-medium tracking-tight">Atividades da clínica</h1>
        <p className="text-sm text-muted-foreground">
          Somente leitura — as atividades são operadas pela própria clínica.
        </p>
      </div>

      {activities.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Esta clínica ainda não tem atividades.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {activities.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cn('rounded px-1.5 py-0.5 font-medium', PRIORITY_COLOR[a.priority])}
                  >
                    {PRIORITY_LABEL[a.priority]}
                  </span>
                  <span className="text-muted-foreground">{activityTypeLabel(a)}</span>
                  <span className="text-muted-foreground">· {STATUS_LABEL[a.status]}</span>
                  {a.dueDate && (
                    <span className="text-muted-foreground">
                      · vence {format(new Date(a.dueDate), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    'font-medium',
                    a.status === 'COMPLETED' && 'line-through opacity-70'
                  )}
                >
                  {a.title}
                </p>
                {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                {a.assignedTo && (
                  <p className="text-xs text-muted-foreground">Responsável: {a.assignedTo.name}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
