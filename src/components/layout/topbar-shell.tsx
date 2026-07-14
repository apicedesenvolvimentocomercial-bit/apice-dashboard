'use client'

import { ChevronDown, Crown, LogOut, Settings, User } from 'lucide-react'
import Link from 'next/link'

import { signOut } from '@/lib/auth-client'
import { logoutAction } from '@/server/actions/auth-actions'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  NotificationBell,
  type BellNotification,
} from '@/components/shared/notifications/notification-bell'

type TopbarUser = {
  name?: string | null
  email?: string | null
  image?: string | null
}

export type TopbarShellProps = {
  user: TopbarUser
  notifications: BellNotification[]
  unreadCount: number
  /** Destino do "Ver tudo" do sino — definido pelo topbar do domínio. */
  notificationsHref?: string | null
  /** Rota de configurações/perfil do domínio (admin `/settings`, clínica `/configuracoes`). */
  settingsHref: string
  /** Quando true, exibe a coroa de dono ao lado do nome. */
  isOwner?: boolean
}

function getInitials(name?: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

/**
 * Casca de topbar BURRA — chrome compartilhado (sino + menu de usuário). Não
 * tem noção de domínio: o `notificationsHref` chega pronto do topbar do domínio
 * (admin/clínica). Divisão total: cada domínio tem seu `*-topbar` que fixa o
 * destino do sino; esta casca só pinta (Fase 5).
 */
export function TopbarShell({
  user,
  notifications,
  unreadCount,
  notificationsHref,
  settingsHref,
  isOwner,
}: TopbarShellProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6 text-card-foreground">
      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          seeAllHref={notificationsHref}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? 'Usuário'} />
                <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              {isOwner && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Crown
                        className="h-3.5 w-3.5 text-amber-500"
                        aria-label="Dono da organização"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Dono da organização</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <span className="hidden text-sm font-medium md:inline-flex">{user.name}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {user.name}
                  {isOwner && (
                    <Crown
                      className="h-3.5 w-3.5 text-amber-500"
                      aria-label="Dono da organização"
                    />
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={settingsHref}>
                  <User className="mr-2 h-4 w-4" />
                  Meu perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={settingsHref}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async () => {
                await logoutAction()
                signOut({ callbackUrl: '/login' })
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
