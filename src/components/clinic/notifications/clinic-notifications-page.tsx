'use client'

import { format, isYesterday, startOfDay, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowRight, Check, CheckCheck, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { NotificationType } from '@prisma/client'

import { cn } from '@/lib/utils'
import {
  deleteClinicNotificationAction,
  markAllClinicNotificationsReadAction,
  markClinicNotificationReadAction,
} from '@/domains/clinic/notifications/notification-actions'

import {
  NotificationTileIcon,
  categoryMeta,
  notificationCategory,
  type NotificationCategory,
} from './notification-category'

/**
 * Página de Notificações do DOMÍNIO CLÍNICA — redesign Senno
 * (prompt/Senno Redesign/Notificações/Notificações-handoff.md):
 * abas de categoria com indicador MEDIDO + "Marcar todas como lidas" (§4) →
 * lista agrupada em Hoje / Esta semana / Anteriores (§6) num card por grupo
 * (§7) → botão de alternância marcar-lida/dispensar com saída animada (§9) →
 * vazio composto por aba (§10).
 *
 * Adaptações à realidade (o protótipo era ficção):
 * - Categoria derivada de `type`+`link` (não persistida — ver notification-category).
 * - Abas = uma por categoria REAL (sem "Agenda", com Metas/Insights/Pacientes)
 *   — decisão de produto 2026-07-14. `sistema` só aparece em "Todas".
 * - Barra de abas rola no eixo X em telas estreitas (não `flex-wrap`) para não
 *   quebrar o indicador medido de linha única — mesmo padrão do Atividades.
 * - O sino da topbar tem seu próprio componente (topbar-notifications) — aqui
 *   é só o corpo da página.
 */

type ClinicNotification = {
  id: string
  type: NotificationType
  title: string
  message: string
  link: string | null
  readAt: Date | null
  createdAt: Date
}

type TabKey = 'todas' | 'nao-lidas' | NotificationCategory

type Tab = { key: TabKey; label: string; showCount?: boolean }

// Ordem fixa: Todas · Não lidas + uma aba por categoria real (§4, adaptado).
const TABS: Tab[] = [
  { key: 'todas', label: 'Todas', showCount: true },
  { key: 'nao-lidas', label: 'Não lidas', showCount: true },
  { key: 'leads', label: 'Leads' },
  { key: 'tarefas', label: 'Atividades' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'metas', label: 'Metas' },
  { key: 'insights', label: 'Insights' },
  { key: 'pacientes', label: 'Pacientes' },
]

// Rótulo do botão de ação (deep-link) por categoria (§7.2, adaptado ao real).
const ACTION_LABEL: Record<NotificationCategory, string> = {
  leads: 'Ver no funil',
  tarefas: 'Abrir atividade',
  financeiro: 'Ver financeiro',
  metas: 'Ver metas',
  insights: 'Ver insight',
  pacientes: 'Ver pacientes',
  sistema: 'Abrir',
}

type GroupKey = 'hoje' | 'semana' | 'antes'
const GROUP_LABEL: Record<GroupKey, string> = {
  hoje: 'Hoje',
  semana: 'Esta semana',
  antes: 'Anteriores',
}
const GROUP_ORDER: GroupKey[] = ['hoje', 'semana', 'antes']

/** Particiona por data (relógio local do navegador, como o protótipo). */
function groupOf(date: Date, now: Date): GroupKey {
  const start = startOfDay(now)
  const d = new Date(date)
  if (d >= start) return 'hoje'
  if (d >= subDays(start, 7)) return 'semana'
  return 'antes'
}

/** Carimbo de tempo por grupo (§7c/§13.2): "Há 8 min" · "Ontem · 18:40" ·
 *  "Ter · 09:00" · "12 jun". */
function stampFor(date: Date, group: GroupKey, now: Date): string {
  const d = new Date(date)
  if (group === 'hoje') {
    const min = Math.floor((now.getTime() - d.getTime()) / 60_000)
    if (min < 1) return 'agora'
    if (min < 60) return `Há ${min} min`
    return `Há ${Math.floor(min / 60)} h`
  }
  if (group === 'semana') {
    const time = format(d, 'HH:mm')
    if (isYesterday(d)) return `Ontem · ${time}`
    const weekday = format(d, 'EEE', { locale: ptBR }).replace('.', '')
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${time}`
  }
  return format(d, 'dd MMM', { locale: ptBR }).replace('.', '')
}

type Props = {
  notifications: ClinicNotification[]
  unreadCount: number
  /** Epoch (ms) do servidor: carimbos/grupos determinísticos SSR↔hidratação. */
  nowMs: number
}

export function ClinicNotificationsPage({ notifications, nowMs }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Overlays otimistas — precedem o dado do servidor para reação instantânea
  // e para segurar a linha em tela durante a animação de saída (§9).
  const [read, setRead] = useState<Set<string>>(new Set())
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<TabKey>('todas')

  // `now` vem do servidor (prop) → SSR e hidratação computam o mesmo carimbo
  // relativo e o mesmo grupo (sem mismatch de minuto).
  const now = useMemo(() => new Date(nowMs), [nowMs])

  const isRead = useCallback((n: ClinicNotification) => n.readAt != null || read.has(n.id), [read])

  const live = useMemo(
    () => notifications.filter((n) => !removed.has(n.id)),
    [notifications, removed]
  )
  const unread = useMemo(() => live.filter((n) => !isRead(n)), [live, isRead])
  const noUnread = unread.length === 0

  // Filtro por aba (§5): não-lidas / todas / categoria.
  const filtered = useMemo(() => {
    if (tab === 'nao-lidas') return unread
    if (tab === 'todas') return live
    return live.filter((n) => notificationCategory(n.type, n.link) === tab)
  }, [tab, live, unread])

  // Reagrupa em Hoje / Esta semana / Anteriores; grupos vazios são omitidos.
  const groups = useMemo(() => {
    return GROUP_ORDER.map((key) => ({
      key,
      items: filtered.filter((n) => groupOf(n.createdAt, now) === key),
    })).filter((g) => g.items.length > 0)
  }, [filtered, now])

  const hasItems = filtered.length > 0

  // ---- Indicador da aba ativa (underline 2px MEDIDO — §4.1) ----
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
    document.fonts?.ready.then(measure).catch(() => {})
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, tab])

  // ---- Mutations ----
  function markOne(id: string) {
    setRead((s) => new Set(s).add(id))
    startTransition(async () => {
      const r = await markClinicNotificationReadAction(id)
      if (!r.success) {
        setRead((s) => {
          const next = new Set(s)
          next.delete(id)
          return next
        })
        toast.error(r.error.message)
        return
      }
      router.refresh()
    })
  }

  function markAll() {
    if (noUnread) return
    const ids = unread.map((n) => n.id)
    setRead((s) => {
      const next = new Set(s)
      ids.forEach((id) => next.add(id))
      return next
    })
    startTransition(async () => {
      const r = await markAllClinicNotificationsReadAction()
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      router.refresh()
    })
  }

  function dismiss(id: string) {
    // Animação começa já; a linha fica no DOM até a saída terminar (§9/§11).
    setLeaving((s) => new Set(s).add(id))
    startTransition(async () => {
      const r = await deleteClinicNotificationAction(id)
      if (!r.success) {
        setLeaving((s) => {
          const next = new Set(s)
          next.delete(id)
          return next
        })
        toast.error(r.error.message)
        return
      }
      // Ao fim da animação (~0,85s) remove do dataset vivo e sincroniza.
      setTimeout(() => {
        setRemoved((s) => new Set(s).add(id))
        setLeaving((s) => {
          const next = new Set(s)
          next.delete(id)
          return next
        })
        router.refresh()
      }, 850)
    })
  }

  const todasCount = live.length
  const unreadTabCount = unread.length

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Barra de abas + "Marcar todas como lidas" (§4) ---- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 overflow-x-auto">
          <div
            ref={tabBarRef}
            className="relative flex w-max items-center gap-0.5 border-b border-border"
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
              const count =
                t.key === 'todas' ? todasCount : t.key === 'nao-lidas' ? unreadTabCount : null
              const showCount = t.showCount && count != null
              const highlight = isActive || (t.key === 'nao-lidas' && (count ?? 0) > 0)
              return (
                <button
                  key={t.key}
                  type="button"
                  data-tab-active={isActive ? '1' : undefined}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    '-mb-px inline-flex items-center gap-[7px] whitespace-nowrap rounded-t-md border-b-2 border-transparent px-3 py-[9px] text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.label}
                  {showCount && (
                    <span
                      className={cn(
                        'min-w-[18px] rounded-full px-1.5 py-px text-center text-[10.5px] font-semibold tabular-nums',
                        highlight
                          ? 'bg-primary/[0.16] text-primary-text'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={markAll}
          disabled={noUnread || pending}
          className={cn(
            'inline-flex h-9 flex-none items-center gap-[7px] rounded-[9px] border border-border px-3.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            noUnread
              ? 'cursor-default bg-background text-muted-foreground/60'
              : 'bg-background text-foreground hover:bg-accent'
          )}
        >
          <CheckCheck className="h-[15px] w-[15px]" aria-hidden="true" />
          Marcar todas como lidas
        </button>
      </div>

      {/* ---- Lista agrupada (§6/§7) OU vazio composto (§10) ---- */}
      {hasItems ? (
        <div className="flex flex-col">
          {groups.map((g) => {
            const visibleUnread = g.items.filter((n) => !isRead(n)).length
            const meta =
              visibleUnread === 0
                ? 'Tudo lido'
                : `${visibleUnread} não lida${visibleUnread === 1 ? '' : 's'}`
            return (
              <div key={g.key} className="mb-[18px] flex flex-col gap-[9px]">
                <div className="flex items-center gap-2.5 px-0.5">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                    {GROUP_LABEL[g.key]}
                  </span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  <span className="text-[11.5px] font-medium tabular-nums text-muted-foreground">
                    {meta}
                  </span>
                </div>

                <div className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
                  {g.items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      notif={n}
                      unread={!isRead(n)}
                      leaving={leaving.has(n.id)}
                      when={stampFor(n.createdAt, g.key, now)}
                      pending={pending}
                      onMarkRead={() => markOne(n.id)}
                      onDismiss={() => dismiss(n.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState tab={tab} onGoAll={() => setTab('todas')} />
      )}
    </div>
  )
}

function NotificationRow({
  notif: n,
  unread,
  leaving,
  when,
  pending,
  onMarkRead,
  onDismiss,
}: {
  notif: ClinicNotification
  unread: boolean
  leaving: boolean
  when: string
  pending: boolean
  onMarkRead: () => void
  onDismiss: () => void
}) {
  const cat = notificationCategory(n.type, n.link)
  const { bg, color } = categoryMeta(cat)

  return (
    <div
      className={cn(
        'senno-notif-row relative flex items-start gap-[13px] border-t border-border px-[18px] py-3.5 first:border-t-0 hover:bg-accent/50',
        unread ? 'bg-primary/[0.05]' : 'bg-transparent',
        leaving && 'senno-notif-leaving'
      )}
    >
      {/* (a) tile do ícone por categoria (§8) */}
      <span
        className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px]"
        style={{ background: bg, color }}
      >
        <NotificationTileIcon type={n.type} link={n.link} className="h-[18px] w-[18px]" />
      </span>

      {/* (b) bloco central */}
      <div className="min-w-0 flex-1 pt-px">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-[13.5px] text-foreground',
              unread ? 'font-semibold' : 'font-medium'
            )}
          >
            {n.title}
          </span>
          {unread && (
            <span
              className="h-[7px] w-[7px] flex-none rounded-full bg-primary"
              aria-hidden="true"
            />
          )}
        </div>
        <p className="mt-[3px] text-[12.5px] leading-[1.45] text-muted-foreground">{n.message}</p>
        {n.link && (
          <Link
            href={n.link}
            className="mt-[9px] inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ACTION_LABEL[cat]}
            <ArrowRight className="h-[13px] w-[13px]" aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* (c) bloco direito: carimbo + toggle */}
      <div className="flex flex-none flex-col items-end gap-2">
        <span className="whitespace-nowrap text-[11.5px] font-medium tabular-nums text-muted-foreground">
          {when}
        </span>
        {unread ? (
          <button
            type="button"
            onClick={onMarkRead}
            disabled={pending}
            title="Marcar como lida"
            aria-label="Marcar como lida"
            className="senno-mark duration-[180ms] flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-primary/40 bg-primary/[0.12] text-primary-text transition-[background-color,border-color,color] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Check className="h-[13px] w-[13px]" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            disabled={pending || leaving}
            title="Dispensar"
            aria-label="Dispensar"
            className="senno-dismiss duration-[180ms] flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border bg-background text-muted-foreground transition-[background-color,border-color,color] hover:border-destructive hover:bg-destructive/[0.12] hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X className="h-[13px] w-[13px]" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyState({ tab, onGoAll }: { tab: TabKey; onGoAll: () => void }) {
  const isUnreadTab = tab === 'nao-lidas'
  const title = isUnreadTab ? 'Você está em dia' : 'Nada por aqui'
  const desc = isUnreadTab
    ? 'Não há notificações não lidas. Tudo o que precisava da sua atenção já foi visto.'
    : 'Nenhuma notificação neste filtro. Quando algo acontecer nesta categoria, aparece aqui.'
  return (
    <div className="flex flex-col items-center gap-[11px] rounded-[13px] border border-dashed border-border bg-card px-6 py-[54px] text-center">
      <span className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-ok-bg text-ok">
        <CheckCheck className="h-[22px] w-[22px]" aria-hidden="true" />
      </span>
      <p className="text-[14.5px] font-semibold">{title}</p>
      <p className="-mt-1 max-w-[340px] text-[12.5px] text-muted-foreground">{desc}</p>
      {tab !== 'todas' && (
        <button
          type="button"
          onClick={onGoAll}
          className="mt-1.5 h-9 rounded-[9px] border border-input bg-background px-4 text-[13px] font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver todas
        </button>
      )}
    </div>
  )
}
