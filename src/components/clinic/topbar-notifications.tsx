'use client'

import { AlertTriangle, Bell, BellOff, CalendarClock, CheckCircle2, Lightbulb } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { NotificationType } from '@prisma/client'

import type { BellNotification } from '@/components/shared/notifications/notification-bell'
import {
  markAllReadAction,
  markNotificationReadAction,
} from '@/server/actions/notification-actions'

/** Tint por tipo (handoff §3.3): ícone em tile redondo com par texto+fundo. */
function tintFor(type: NotificationType): {
  icon: React.ElementType
  tile: string
} {
  switch (type) {
    case 'INSIGHT_GENERATED':
      return { icon: Lightbulb, tile: 'bg-primary/[0.16] text-primary-text' }
    case 'GOAL_ACHIEVED':
      return { icon: CheckCircle2, tile: 'bg-ok-bg text-ok' }
    case 'GOAL_AT_RISK':
      return { icon: AlertTriangle, tile: 'bg-warn-bg text-warn' }
    case 'ACTIVITY_OVERDUE':
      return { icon: AlertTriangle, tile: 'bg-destructive/[0.14] text-destructive' }
    case 'ACTIVITY_DUE':
      return { icon: CalendarClock, tile: 'bg-accent text-muted-foreground' }
    case 'CLIENT_INACTIVE':
      return { icon: BellOff, tile: 'bg-accent text-muted-foreground' }
    default:
      return { icon: Bell, tile: 'bg-accent text-muted-foreground' }
  }
}

/** Tempo relativo curto pt-BR: agora · N min · N h · N d · dd/mm. */
function relativeTime(date: Date): string {
  const diffMin = Math.floor((Date.now() - new Date(date).getTime()) / 60_000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} d`
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(
    new Date(date)
  )
}

type Props = {
  notifications: BellNotification[]
  unreadCount: number
}

/**
 * Sino do topbar (redesign — handoff §3.3): dot destructive quando há
 * não-lidas, shake ao clicar, popover com contador, "Marcar todas como
 * lidas", linhas tintadas por tipo e rodapé "Ver todas as notificações".
 */
export function TopbarNotifications({ notifications, unreadCount }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [ringing, setRinging] = useState(false)
  const [pending, startTransition] = useTransition()

  const hasUnread = unreadCount > 0

  function markOne(id: string, link: string | null, alreadyRead: boolean) {
    startTransition(async () => {
      if (!alreadyRead) {
        const r = await markNotificationReadAction(id)
        if (!r.success) {
          toast.error(r.error.message)
          return
        }
        router.refresh()
      }
      if (link) {
        setOpen(false)
        router.push(link)
      }
    })
  }

  function markAll() {
    startTransition(async () => {
      const r = await markAllReadAction()
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="relative flex-none">
      <button
        type="button"
        onClick={() => {
          setRinging(true)
          setOpen((o) => !o)
        }}
        title="Notificações"
        aria-label={`Notificações${hasUnread ? ` (${unreadCount} não lidas)` : ''}`}
        className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border border-border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={ringing ? 'senno-bell-ring inline-flex' : 'inline-flex'}
          onAnimationEnd={() => setRinging(false)}
        >
          <Bell className="h-[17px] w-[17px]" aria-hidden="true" />
        </span>
        {hasUnread && (
          <span className="absolute right-2 top-[7px] h-[7px] w-[7px] rounded-full border-[1.5px] border-card bg-destructive" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-[46px] z-50 w-[362px] overflow-hidden rounded-xl border border-border bg-popover shadow-pop">
            <div className="flex items-center justify-between gap-2.5 px-3.5 pb-2.5 pt-3">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                Notificações
                {hasUnread && (
                  <span className="rounded-full bg-primary/[0.16] px-[7px] py-px text-[11px] font-semibold tabular-nums text-primary-text">
                    {unreadCount}
                  </span>
                )}
              </span>
              {hasUnread && (
                <button
                  type="button"
                  onClick={markAll}
                  disabled={pending}
                  className="px-1 py-0.5 text-[11.5px] font-semibold text-primary-text hover:underline disabled:opacity-50"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="flex max-h-[344px] flex-col overflow-y-auto px-1.5 pb-1.5">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <Bell
                    className="h-[30px] w-[30px] text-muted-foreground"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <p className="text-[13px] font-medium">Nenhuma notificação</p>
                  <p className="-mt-1 text-xs text-muted-foreground">
                    Os avisos da clínica aparecerão aqui.
                  </p>
                </div>
              ) : (
                notifications.map((n) => {
                  const { icon: Icon, tile } = tintFor(n.type)
                  const unread = !n.readAt
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => markOne(n.id, n.link, !unread)}
                      disabled={pending}
                      className={`flex w-full items-start gap-[11px] rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent disabled:opacity-60 ${
                        unread ? 'bg-primary/5' : ''
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${tile}`}
                      >
                        <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[12.5px] text-foreground ${
                            unread ? 'font-semibold' : 'font-medium'
                          }`}
                        >
                          {n.title}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          {n.message}
                        </span>
                      </span>
                      <span className="flex flex-none flex-col items-end gap-[5px]">
                        <span className="whitespace-nowrap text-[10.5px] text-muted-foreground">
                          {relativeTime(n.createdAt)}
                        </span>
                        {unread && <span className="h-[7px] w-[7px] rounded-full bg-primary" />}
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-center border-t border-border bg-muted/40 px-3.5 py-[9px]">
              <Link
                href="/notificacoes"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-primary-text hover:underline"
              >
                Ver todas as notificações
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
