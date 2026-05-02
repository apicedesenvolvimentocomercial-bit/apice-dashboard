'use client'

import { Bell, ChevronDown, LogOut, Settings, User } from 'lucide-react'
import { signOut } from 'next-auth/react'
import Link from 'next/link'

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

type User = {
  name?: string | null
  email?: string | null
  image?: string | null
}

type Props = {
  user: User
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

export function AppTopbar({ user }: Props) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-6 dark:bg-zinc-900">
      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Notificações" asChild>
          <Link href="/settings">
            <Bell className="h-4 w-4" />
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? 'Usuário'} />
                <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium md:inline-flex">{user.name}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <User className="mr-2 h-4 w-4" />
                  Meu perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: '/login' })}
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
