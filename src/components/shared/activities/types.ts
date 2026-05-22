import type { ActivityPriority, ActivityStatus, ActivityType } from '@prisma/client'

export type ActivityView = {
  id: string
  title: string
  description: string | null
  type: ActivityType
  status: ActivityStatus
  priority: ActivityPriority
  dueDate: Date | null
  completedAt: Date | null
  createdAt: Date
  seenByAssigneeAt: Date | null
  broadcastId: string | null
  client: { id: string; name: string } | null
  assignedTo: { id: string; name: string; image: string | null } | null
  createdBy: { id: string; name: string } | null
}

export const TYPE_LABEL: Record<ActivityType, string> = {
  TASK: 'Tarefa',
  MEETING: 'Reunião',
  CALL: 'Ligação',
  EMAIL: 'E-mail',
  NOTE: 'Nota',
}

export const STATUS_LABEL: Record<ActivityStatus, string> = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
}

export const PRIORITY_LABEL: Record<ActivityPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
}

export const PRIORITY_COLOR: Record<ActivityPriority, string> = {
  LOW: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  MEDIUM: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  HIGH: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  URGENT: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

export const STATUS_COLOR: Record<ActivityStatus, string> = {
  PENDING: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELED: 'bg-zinc-100 text-zinc-500 line-through dark:bg-zinc-800',
}

export type ActivityView_Counts = {
  today: number
  week: number
  overdue: number
  all: number
  done: number
}
