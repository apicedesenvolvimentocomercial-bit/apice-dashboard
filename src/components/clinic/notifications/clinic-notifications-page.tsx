'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import type { NotificationType } from '@prisma/client'

import { Button } from '@/components/ui/button'
import {
  deleteClinicNotificationAction,
  markAllClinicNotificationsReadAction,
  markClinicNotificationReadAction,
} from '@/domains/clinic/notifications/notification-actions'
import {
  NotificationColor,
  NotificationIcon,
  notificationTypeLabel,
} from '@/modules/notifications/notification-icon'

/**
 * Página de Notificações do DOMÍNIO CLÍNICA (Fase 2). Componente próprio da
 * clínica (sem `if (role)`); usa apenas as actions de clínica. O display
 * (ícone/cor/label) reusa o primitivo presentacional de `notification-icon`
 * (sem lógica de domínio) — a realocar p/ components/ui na Fase 7.
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

type Props = {
  notifications: ClinicNotification[]
  unreadCount: number
}

export function ClinicNotificationsPage({ notifications, unreadCount }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function markOne(id: string) {
    startTransition(async () => {
      const r = await markClinicNotificationReadAction(id)
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      router.refresh()
    })
  }

  function markAll() {
    startTransition(async () => {
      const r = await markAllClinicNotificationsReadAction()
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      toast.success('Todas marcadas como lidas')
      router.refresh()
    })
  }

  function dismiss(id: string) {
    startTransition(async () => {
      const r = await deleteClinicNotificationAction(id)
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} não lidas` : 'Tudo em dia'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAll} disabled={pending}>
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Sem notificações por enquanto.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`group flex items-start gap-3 px-4 py-3 ${n.readAt ? 'opacity-70' : ''}`}
            >
              <span className={`mt-1 ${NotificationColor(n.type)}`}>
                <NotificationIcon type={n.type} />
              </span>
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <span>{notificationTypeLabel(n.type)}</span>
                  <span>·</span>
                  <span>{format(new Date(n.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                </div>
                <p className="font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <div className="flex gap-2 text-xs">
                  {n.link && (
                    <Link href={n.link} className="text-primary hover:underline">
                      Abrir
                    </Link>
                  )}
                  {!n.readAt && (
                    <button
                      onClick={() => markOne(n.id)}
                      className="text-muted-foreground hover:underline disabled:opacity-50"
                      disabled={pending}
                    >
                      Marcar como lida
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismiss(n.id)}
                disabled={pending}
                aria-label="Dispensar notificação"
                className="ml-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 disabled:opacity-50 group-hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
