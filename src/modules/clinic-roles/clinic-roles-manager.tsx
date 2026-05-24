'use client'

import { Crown, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  assignClinicRoleAction,
  deleteClinicRoleAction,
} from '@/server/actions/clinic-role-actions'
import { transferClinicOwnershipAction } from '@/server/actions/clinic-owner-actions'
import type { ClinicRolePermissions } from '@/server/auth/clinic-permissions'

import { RoleDialog, type RoleDialogInitial } from './role-dialog'

export type RoleItem = {
  id: string
  name: string
  permissions: ClinicRolePermissions
  canManageRoles: boolean
  isSystem: boolean
  userCount: number
}

export type UserItem = {
  id: string
  name: string
  email: string
  role: 'CLIENT_OWNER' | 'CLIENT_STAFF'
  isActive: boolean
  isOwner: boolean
  clinicRoleId: string | null
  clinicRoleName: string | null
}

type Props = {
  roles: RoleItem[]
  users: UserItem[]
  // Quem está vendo é o titular? (controla o botão de transferir titularidade)
  viewerIsOwner: boolean
}

const NO_ROLE = '__none__'

export function ClinicRolesManager({ roles, users, viewerIsOwner }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RoleDialogInitial | undefined>(undefined)
  const [pending, startTransition] = useTransition()

  function openCreate() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(role: RoleItem) {
    setEditing({
      id: role.id,
      name: role.name,
      permissions: role.permissions,
      canManageRoles: role.canManageRoles,
    })
    setDialogOpen(true)
  }

  function removeRole(role: RoleItem) {
    if (role.userCount > 0) {
      if (
        !confirm(
          `${role.userCount} usuário(s) usam o cargo "${role.name}". Eles ficarão sem cargo. Continuar?`
        )
      )
        return
    }
    startTransition(async () => {
      const res = await deleteClinicRoleAction({ roleId: role.id })
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success('Cargo excluído')
      router.refresh()
    })
  }

  function changeUserRole(userId: string, value: string) {
    startTransition(async () => {
      const res = await assignClinicRoleAction({
        userId,
        roleId: value === NO_ROLE ? null : value,
      })
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success('Cargo atribuído')
      router.refresh()
    })
  }

  function transferOwnership(user: UserItem) {
    if (
      !confirm(
        `Transferir a titularidade da clínica para ${user.name}? Você deixará de ser o titular.`
      )
    )
      return
    startTransition(async () => {
      const res = await transferClinicOwnershipAction({ targetUserId: user.id })
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success('Titularidade transferida')
      router.refresh()
    })
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Cargos e permissões</CardTitle>
            <CardDescription>
              Crie cargos e defina o que cada um acessa. O titular tem acesso total.
            </CardDescription>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo cargo
          </Button>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cargo criado ainda.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {roles.map((role) => (
                <div key={role.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{role.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {role.userCount} usuário{role.userCount !== 1 ? 's' : ''}
                      {role.canManageRoles ? ' · pode gerenciar cargos' : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(role)}
                      disabled={pending}
                      aria-label={`Editar ${role.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-rose-600 hover:text-rose-700"
                      onClick={() => removeRole(role)}
                      disabled={pending}
                      aria-label={`Excluir ${role.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuários da clínica</CardTitle>
          <CardDescription>Atribua um cargo a cada usuário interno.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{user.name}</span>
                    {user.isOwner && (
                      <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label="Titular" />
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {user.isOwner ? (
                    <span className="text-xs text-muted-foreground">Acesso total</span>
                  ) : (
                    <Select
                      value={user.clinicRoleId ?? NO_ROLE}
                      onValueChange={(v) => changeUserRole(user.id, v)}
                      disabled={pending}
                    >
                      <SelectTrigger className="h-8 w-44 text-sm">
                        <SelectValue placeholder="Sem cargo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ROLE}>Sem cargo</SelectItem>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {/* Transferir titularidade: só o titular vê, e só p/ outros CLIENT_OWNER. */}
                  {viewerIsOwner && !user.isOwner && user.role === 'CLIENT_OWNER' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => transferOwnership(user)}
                      disabled={pending}
                    >
                      {pending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Crown className="h-3.5 w-3.5" />
                      )}
                      Tornar titular
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <RoleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={() => router.refresh()}
      />
    </>
  )
}
