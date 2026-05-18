'use client'

import { Loader2, MoreHorizontal, Plus, Send, UserPlus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  cancelClinicInvitationAction,
  removeClinicUserAction,
  resendClinicInvitationAction,
} from '@/server/actions/client-actions'
import type { ClinicInvitation, ClinicUser } from '@/server/queries/client-queries'

import { InviteClinicUserDialog } from './invite-clinic-user-dialog'

type Props = {
  clientId: string
  clientName: string
  currentUserId: string
  users: ClinicUser[]
  invitations: ClinicInvitation[]
}

const ROLE_LABELS: Record<'CLIENT_OWNER' | 'CLIENT_STAFF', string> = {
  CLIENT_OWNER: 'Dono',
  CLIENT_STAFF: 'Funcionário',
}

export function ClientUsers({ clientId, clientName, currentUserId, users, invitations }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [defaultEmail, setDefaultEmail] = useState<string | undefined>(undefined)

  function openInvite(email?: string) {
    setDefaultEmail(email)
    setInviteOpen(true)
  }

  function handleRemove(userId: string, userName: string) {
    if (!confirm(`Remover "${userName}" desta clínica? Você poderá reenviar um convite depois.`)) {
      return
    }
    startTransition(async () => {
      const result = await removeClinicUserAction({ clientId, userId })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Usuário removido')
      router.refresh()
    })
  }

  function handleResend(invitationId: string) {
    startTransition(async () => {
      const result = await resendClinicInvitationAction({ invitationId })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Convite reenviado')
      router.refresh()
    })
  }

  function handleCancel(invitationId: string, email: string) {
    if (!confirm(`Cancelar o convite para ${email}?`)) return
    startTransition(async () => {
      const result = await cancelClinicInvitationAction({ invitationId })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Convite cancelado')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Usuários da clínica</h2>
          <p className="text-sm text-muted-foreground">
            {users.length} {users.length === 1 ? 'usuário ativo' : 'usuários ativos'}
            {invitations.length > 0 &&
              ` · ${invitations.length} ${invitations.length === 1 ? 'convite pendente' : 'convites pendentes'}`}
          </p>
        </div>
        <Button onClick={() => openInvite()}>
          <Plus className="mr-2 h-4 w-4" />
          Convidar usuário
        </Button>
      </div>

      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <UserPlus className="mb-4 h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-base font-medium">Nenhum usuário nesta clínica</h3>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Convide o primeiro usuário para começar.
          </p>
          <Button onClick={() => openInvite()}>
            <Plus className="mr-2 h-4 w-4" />
            Convidar usuário
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nome</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Cargo</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Último login</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId
                return (
                  <tr key={user.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {user.name}
                        {isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={user.role === 'CLIENT_OWNER' ? 'default' : 'secondary'}>
                        {ROLE_LABELS[user.role as 'CLIENT_OWNER' | 'CLIENT_STAFF']}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.isActive ? 'success' : 'outline'}>
                        {user.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending || isSelf}
                            aria-label="Ações"
                          >
                            {pending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => handleRemove(user.id, user.name)}
                          >
                            Remover da clínica
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {invitations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">Convites pendentes</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Cargo</th>
                  <th className="px-4 py-3 text-left font-medium">Enviado em</th>
                  <th className="px-4 py-3 text-left font-medium">Expira em</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => {
                  const expired = new Date(inv.expiresAt) < new Date()
                  return (
                    <tr key={inv.id} className="border-t">
                      <td className="px-4 py-3">{inv.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">
                          {ROLE_LABELS[inv.role as 'CLIENT_OWNER' | 'CLIENT_STAFF'] ?? inv.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(inv.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        {expired ? (
                          <Badge variant="critical">Expirado</Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {new Date(inv.expiresAt).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => handleResend(inv.id)}
                          >
                            <Send className="mr-1 h-3.5 w-3.5" />
                            Reenviar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => handleCancel(inv.id, inv.email)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InviteClinicUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        clientId={clientId}
        clientName={clientName}
        defaultEmail={defaultEmail}
      />
    </div>
  )
}
