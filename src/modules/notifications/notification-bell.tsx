'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { NotificationType } from '@prisma/client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  markAllReadAction,
  markNotificationReadAction,
} from '@/server/actions/notification-actions'

import { NotificationColor, NotificationIcon, notificationTypeLabel } from './notification-icon'

export type BellNotification = {
  id: string
  type: NotificationType
  title: string
  message: string
  link: string | null
  readAt: Date | null
  createdAt: Date
}

type Props = {
  notifications: BellNotification[]
  unreadCount: number
  seeAllHref?: string | null
}

export function NotificationBell({ notifications, unreadCount, seeAllHref }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function markOne(id: string, link: string | null) {
    startTransition(async () => {
      const r = await markNotificationReadAction(id)
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      router.refresh()
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
      toast.success('Todas as notificações marcadas como lidas')
      router.refresh()
    })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notificações</span>
          {unreadCount > 0 && (
            <button
              className="text-xs text-primary hover:underline disabled:opacity-50"
              onClick={markAll}
              disabled={pending}
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              Sem notificações
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`px-3 py-2 transition-colors hover:bg-accent ${
                    n.readAt ? 'opacity-70' : 'bg-primary/5'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => markOne(n.id, n.link)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span className={`mt-0.5 ${NotificationColor(n.type)}`}>
                      <NotificationIcon type={n.type} />
                    </span>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {notificationTypeLabel(n.type)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(n.createdAt), 'dd/MM HH:mm', { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {seeAllHref && (
          <div className="border-t px-3 py-2 text-right">
            <Link
              href={seeAllHref}
              onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline"
            >
              Ver tudo
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
