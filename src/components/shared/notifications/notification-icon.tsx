import { AlertTriangle, Bell, CheckCircle2, Lightbulb, CalendarClock, BellOff } from 'lucide-react'
import type { NotificationType } from '@prisma/client'

export function NotificationIcon({ type }: { type: NotificationType }) {
  const className = 'h-4 w-4'
  switch (type) {
    case 'INSIGHT_GENERATED':
      return <Lightbulb className={className} />
    case 'GOAL_AT_RISK':
      return <AlertTriangle className={className} />
    case 'GOAL_ACHIEVED':
      return <CheckCircle2 className={className} />
    case 'ACTIVITY_DUE':
      return <CalendarClock className={className} />
    case 'ACTIVITY_OVERDUE':
      return <AlertTriangle className={className} />
    case 'CLIENT_INACTIVE':
      return <BellOff className={className} />
    case 'SYSTEM':
    default:
      return <Bell className={className} />
  }
}

export function NotificationColor(type: NotificationType): string {
  switch (type) {
    case 'INSIGHT_GENERATED':
      return 'text-blue-600 dark:text-blue-400'
    case 'GOAL_AT_RISK':
      return 'text-amber-600 dark:text-amber-400'
    case 'GOAL_ACHIEVED':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'ACTIVITY_DUE':
      return 'text-blue-600 dark:text-blue-400'
    case 'ACTIVITY_OVERDUE':
      return 'text-red-600 dark:text-red-400'
    case 'CLIENT_INACTIVE':
      return 'text-zinc-500'
    case 'SYSTEM':
    default:
      return 'text-zinc-600 dark:text-zinc-300'
  }
}

export function notificationTypeLabel(type: NotificationType): string {
  const map: Record<NotificationType, string> = {
    INSIGHT_GENERATED: 'Insight',
    GOAL_AT_RISK: 'Meta em risco',
    GOAL_ACHIEVED: 'Meta atingida',
    ACTIVITY_DUE: 'Atividade próxima',
    ACTIVITY_OVERDUE: 'Atividade atrasada',
    CLIENT_INACTIVE: 'Cliente inativo',
    SYSTEM: 'Sistema',
  }
  return map[type]
}
