'use client'

import { differenceInCalendarDays, format, isSameDay, isTomorrow, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Check,
  CheckSquare,
  ChevronDown,
  Flag,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Play,
  Star,
  StickyNote,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  deleteClinicActivityAction,
  updateClinicActivityStatusAction,
} from '@/domains/clinic/activities/activity-actions'
import { cn } from '@/lib/utils'
import {
  activityTypeLabel,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type ActivityView,
} from '@/components/shared/activities/types'

/**
 * Linha de atividade do redesign (atividades-handoff §7): tile de ícone por
 * TIPO (tints HSL fixos — são cor de dado, não chrome), título + sub
 * "{tipo} · {alvo}", prazo à direita (destructive quando atrasada), pill
 * "Alta"/"Urgente" e checkbox de conclusão com animação de saída (§8).
 *
 * Clicar na linha expande o conteúdo completo (descrição + metadados), com a
 * mesma animação grid-rows 0fr↔1fr dos cards de Insights.
 *
 * O menu "..." (Iniciar/Cancelar/Excluir/Reabrir) não existe no protótipo,
 * mas preserva funcionalidade real — aparece só no hover da linha.
 */

// Tints por tipo (handoff §7.3) — HSL fixo de propósito (série de dados).
const TYPE_TILE: Record<ActivityView['type'], { icon: LucideIcon; bg: string; color: string }> = {
  TASK: { icon: CheckSquare, bg: 'hsl(var(--primary)/0.14)', color: 'hsl(var(--primary-text))' },
  MEETING: { icon: Users, bg: 'hsl(262 52% 58% / 0.16)', color: 'hsl(262 48% 56%)' },
  CALL: { icon: Phone, bg: 'hsl(217 80% 58% / 0.16)', color: 'hsl(217 75% 50%)' },
  EMAIL: { icon: Mail, bg: 'hsl(190 70% 45% / 0.18)', color: 'hsl(190 68% 36%)' },
  NOTE: { icon: StickyNote, bg: 'hsl(38 85% 50% / 0.18)', color: 'hsl(32 80% 40%)' },
  MESSAGE: { icon: MessageSquare, bg: 'hsl(142 58% 44% / 0.16)', color: 'hsl(142 52% 38%)' },
}

// Tipo personalizado da clínica → ícone padrão (estrela) + tint neutro.
const TYPE_TILE_DEFAULT = {
  icon: Star,
  bg: 'hsl(var(--muted))',
  color: 'hsl(var(--muted-foreground))',
}

// Tom do valor "Prioridade" no corpo expandido — par de status do design.md
// (nada de zinc/amber literais; o legado PRIORITY_COLOR não segue os tokens).
const PRIORITY_TONE: Record<ActivityView['priority'], string> = {
  LOW: 'text-muted-foreground',
  MEDIUM: 'text-foreground',
  HIGH: 'text-warn',
  URGENT: 'text-destructive',
}

// Pill de status no rodapé do corpo expandido (par texto+fundo, design.md §1).
const STATUS_PILL: Record<ActivityView['status'], string> = {
  PENDING: 'bg-warn-bg text-warn',
  IN_PROGRESS: 'bg-info-bg text-info-t',
  COMPLETED: 'bg-ok-bg text-ok',
  CANCELED: 'bg-muted text-muted-foreground',
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "Hoje · 14:00" · "Venceu ontem" · "Qua · 13:00" · "07/08 · 10:00".
 *  "Venceu" só em atrasadas — data passada de item concluído sai sem prefixo. */
function whenLabel(due: Date, overdue: boolean): string {
  const now = new Date()
  const time = format(due, 'HH:mm')
  if (isSameDay(due, now)) return overdue ? `Venceu hoje · ${time}` : `Hoje · ${time}`
  if (isYesterday(due)) return overdue ? 'Venceu ontem' : `Ontem · ${time}`
  if (overdue) return `Venceu ${format(due, 'dd/MM')}`
  if (isTomorrow(due)) return `Amanhã · ${time}`
  const diff = differenceInCalendarDays(due, now)
  if (diff > 0 && diff < 7) {
    const weekday = format(due, 'EEE', { locale: ptBR }).replace('.', '')
    return `${capitalize(weekday)} · ${time}`
  }
  return `${format(due, 'dd/MM')} · ${time}`
}

type Props = {
  activity: ActivityView
  /** Nome do responsável no sub (só na pasta "Todos"). */
  assigneeSuffix?: string | null
  isNewForViewer?: boolean
}

export function ClinicActivityRow({ activity, assigneeSuffix, isNewForViewer }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [leaving, setLeaving] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const isDone = activity.status === 'COMPLETED'
  const isCanceled = activity.status === 'CANCELED'
  const isOverdue =
    !!activity.dueDate &&
    !isDone &&
    !isCanceled &&
    new Date(activity.dueDate).getTime() < Date.now()

  const isCustomType = !!activity.customTypeLabel?.trim()
  const tile = isCustomType ? TYPE_TILE_DEFAULT : (TYPE_TILE[activity.type] ?? TYPE_TILE_DEFAULT)
  const TileIcon = tile.icon

  const subParts = [
    activityTypeLabel(activity),
    activity.target?.name ?? activity.description ?? null,
    assigneeSuffix,
  ].filter(Boolean)

  // "Feitas" mostra quando foi concluída; abertas mostram o prazo.
  const when = isDone
    ? activity.completedAt
      ? whenLabel(new Date(activity.completedAt), false)
      : null
    : activity.dueDate
      ? whenLabel(new Date(activity.dueDate), isOverdue)
      : 'Sem prazo'

  const showHighPill = !isDone && (activity.priority === 'HIGH' || activity.priority === 'URGENT')
  const isUrgent = activity.priority === 'URGENT'

  function complete() {
    if (leaving || pending || isDone) return
    setLeaving(true) // animação começa já; o refresh remove a linha depois
    startTransition(async () => {
      const r = await updateClinicActivityStatusAction(activity.id, 'COMPLETED')
      if (!r.success) {
        setLeaving(false)
        toast.error(r.error.message)
        return
      }
      setTimeout(() => router.refresh(), 850)
    })
  }

  function setStatus(status: ActivityView['status']) {
    startTransition(async () => {
      const r = await updateClinicActivityStatusAction(activity.id, status)
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
      const r = await deleteClinicActivityAction(activity.id)
      if (r.success) {
        toast.success('Atividade excluída')
        router.refresh()
      } else {
        toast.error(r.error.message)
      }
    })
  }

  // Fatos principais do corpo expandido — tiles no topo (padrão KPI do
  // design.md §5: ícone + label overline, valor abaixo).
  type Fact = {
    label: string
    value: string
    icon: LucideIcon
    iconColor?: string
    valueClass?: string
  }
  const facts: Fact[] = [
    ...(activity.assignedTo
      ? [{ label: 'Responsável', value: activity.assignedTo.name, icon: User }]
      : []),
    {
      label: 'Tipo',
      value: activityTypeLabel(activity),
      icon: TileIcon,
      iconColor: tile.color,
    },
    {
      label: 'Prioridade',
      value: PRIORITY_LABEL[activity.priority],
      icon: Flag,
      valueClass: PRIORITY_TONE[activity.priority],
    },
    ...(activity.target
      ? [
          {
            label: activity.target.type === 'lead' ? 'Lead' : 'Paciente',
            value: activity.target.name,
            icon: activity.target.type === 'lead' ? UserPlus : User,
          },
        ]
      : []),
  ]

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      // Sem o label, o nome acessível do "botão" seria o texto da linha
      // inteira (título + prazo + corpo expandido concatenados).
      aria-label={activity.title}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded((v) => !v)
        }
      }}
      className={cn(
        'senno-act-row group cursor-pointer border-t border-border px-[18px] py-3.5 hover:bg-accent/50',
        leaving && 'senno-act-leaving'
      )}
      // `.senno-act-row` tem `max-height: 180px` (teto p/ a animação de saída);
      // expandida, o corpo pode passar disso — solta o teto. O colapso do
      // `.senno-act-leaving` segue funcionando (max-height 0 é !important).
      style={{ maxHeight: expanded ? 'none' : undefined }}
    >
      <div className="flex items-center gap-3.5">
        <span
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px]"
          style={{ background: tile.bg, color: tile.color }}
          title={activityTypeLabel(activity)}
        >
          <TileIcon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isNewForViewer && !isDone && (
              <span className="flex-none rounded-full bg-primary/[0.16] px-2 py-px text-[10.5px] font-semibold text-primary-text">
                Nova
              </span>
            )}
            <span
              className={cn(
                'truncate text-[13.5px] font-semibold',
                isDone || isCanceled ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
            >
              {activity.title}
            </span>
          </div>
          {subParts.length > 0 && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {subParts.join(' · ')}
            </div>
          )}
        </div>

        {when && (
          <span
            className={cn(
              'flex-none whitespace-nowrap text-xs font-medium tabular-nums',
              isOverdue ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {when}
          </span>
        )}

        {showHighPill && (
          <span
            className={cn(
              'flex-none rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
              isUrgent ? 'bg-destructive/[0.12] text-destructive' : 'bg-warn-bg text-warn'
            )}
          >
            {isUrgent ? 'Urgente' : 'Alta'}
          </span>
        )}

        {isDone ? (
          <span
            className="senno-check flex h-6 w-6 flex-none items-center justify-center rounded-full border-[1.5px] border-ok bg-ok text-[hsl(0_0%_100%)]"
            aria-label="Concluída"
          >
            <Check className="h-[13px] w-[13px]" aria-hidden="true" />
          </span>
        ) : (
          <button
            type="button"
            aria-label="Concluir atividade"
            disabled={pending || leaving}
            onClick={(e) => {
              e.stopPropagation()
              complete()
            }}
            className="senno-check flex h-6 w-6 flex-none cursor-pointer items-center justify-center rounded-full border-[1.5px] border-border bg-transparent text-muted-foreground/40 transition-[background-color,border-color,color,transform] duration-200 hover:border-ok hover:bg-ok/[0.12] hover:text-ok"
          >
            <Check className="h-[13px] w-[13px]" aria-hidden="true" />
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Mais opções"
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-7 flex-none text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
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
            {isDone && (
              <DropdownMenuItem onClick={() => setStatus('PENDING')}>
                <Play className="mr-2 h-4 w-4" /> Reabrir
              </DropdownMenuItem>
            )}
            {!isDone && !isCanceled && (
              <DropdownMenuItem onClick={() => setStatus('CANCELED')}>
                <X className="mr-2 h-4 w-4" /> Cancelar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={remove}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ChevronDown
          className={cn(
            'h-4 w-4 flex-none text-muted-foreground transition-transform duration-340 ease-senno',
            expanded && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </div>

      {/* Região expansível — anima altura via grid-template-rows 0fr↔1fr, o
          mesmo padrão do card de Insights. */}
      <div
        className="grid transition-[grid-template-rows] duration-340 ease-senno-io"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Interagir com o corpo não recolhe a linha. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div
            className="flex flex-col gap-2.5 pl-[52px] pr-1 pt-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Topo — fatos principais (responsável · tipo · prioridade · alvo). */}
            <div className="flex flex-wrap gap-2">
              {facts.map((f) => {
                const FactIcon = f.icon
                return (
                  <div
                    key={f.label}
                    className="flex min-w-[136px] flex-1 flex-col gap-1 rounded-[10px] border border-border bg-muted/40 px-3 py-2"
                  >
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                      <FactIcon
                        className="h-3 w-3 flex-none"
                        style={f.iconColor ? { color: f.iconColor } : undefined}
                        aria-hidden="true"
                      />
                      {f.label}
                    </span>
                    <span
                      className={cn(
                        'truncate text-[12.5px] font-semibold',
                        f.valueClass ?? 'text-foreground'
                      )}
                      title={f.value}
                    >
                      {f.value}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Descrição. */}
            <div className="rounded-[10px] border border-border bg-muted/25 px-3 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                Descrição
              </span>
              {activity.description ? (
                <p className="m-0 mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-[1.45] text-foreground/90">
                  {activity.description}
                </p>
              ) : (
                <p className="m-0 mt-1 text-[12.5px] italic text-muted-foreground/70">
                  Sem descrição.
                </p>
              )}
            </div>

            {/* Rodapé — status + autoria/prazo. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-muted-foreground">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                  STATUS_PILL[activity.status]
                )}
              >
                {STATUS_LABEL[activity.status]}
              </span>
              {activity.createdBy && (
                <span className="min-w-0">
                  Criada por{' '}
                  <span className="font-medium text-foreground/80">{activity.createdBy.name}</span>{' '}
                  em{' '}
                  <span className="tabular-nums">
                    {format(new Date(activity.createdAt), 'dd/MM/yyyy')}
                  </span>
                </span>
              )}
              {activity.dueDate && (
                <span className="min-w-0">
                  Vence em{' '}
                  <span className={cn('tabular-nums', isOverdue && 'font-medium text-destructive')}>
                    {format(new Date(activity.dueDate), "dd/MM/yyyy 'às' HH:mm")}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
