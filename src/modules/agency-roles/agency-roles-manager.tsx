'use client'

import { Crown, Pencil, Plus, Trash2 } from 'lucide-react'
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
  assignAgencyRoleAction,
  deleteAgencyRoleAction,
} from '@/server/actions/agency-role-actions'
import type { RolePermissions } from '@/server/auth/role-permissions'

import { RoleDialog, type RoleDialogInitial } from './role-dialog'

export type RoleItem = {
  id: string
  name: string
  permissions: RolePermissions
  canManageRoles: boolean
  level: number
  userCount: number
}

export type UserItem = {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'STAFF'
  isActive: boolean
  isOwner: boolean
  agencyRoleId: string | null
  agencyRoleName: string | null
}

type Props = {
  roles: RoleItem[]
  users: UserItem[]
  // Nível do ator (null = coroa/ADMIN, acima de tudo) — controla o mínimo de
  // nível de cargo que ele pode criar e quais cargos pode editar/atribuir.
  viewerLevel: number | null
}

const NO_ROLE = '__none__'

export function AgencyRolesManager({ roles, users, viewerLevel }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RoleDialogInitial | undefined>(undefined)
  const [pending, startTransition] = useTransition()

  // Cargo abaixo do ator? (coroa = viewerLevel null vê/edita tudo)
  const canActOn = (level: number) => viewerLevel === null || viewerLevel < level
  // Menor nível que o ator pode atribuir a um novo cargo (estritamente abaixo).
  const minLevel = viewerLevel === null ? 1 : viewerLevel + 1

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
      level: role.level,
    })
    setDialogOpen(true)
  }

  function removeRole(role: RoleItem) {
    if (role.userCount > 0) {
      if (
        !confirm(
          `${role.userCount} usuário(s) usam o cargo "${role.name}". Eles ficarão sem cargo (sem acesso). Continuar?`
        )
      )
        return
    }
    startTransition(async () => {
      const res = await deleteAgencyRoleAction({ roleId: role.id })
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
      const res = await assignAgencyRoleAction({
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

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Cargos e permissões</CardTitle>
            <CardDescription>
              Crie cargos da agência e defina o que cada um acessa. O dono e os administradores têm
              acesso total. Cargos abaixo do seu nível.
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
              {roles.map((role) => {
                const editable = canActOn(role.level)
                return (
                  <div
                    key={role.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {role.name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          nível {role.level}
                        </span>
                      </div>
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
                        disabled={pending || !editable}
                        aria-label={`Editar ${role.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-rose-600 hover:text-rose-700"
                        onClick={() => removeRole(role)}
                        disabled={pending || !editable}
                        aria-label={`Excluir ${role.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membros da agência</CardTitle>
          <CardDescription>Atribua um cargo a cada membro interno.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border">
            {users.map((user) => {
              // Pode mexer neste usuário? Coroa sempre; senão, o cargo atual do
              // alvo precisa estar abaixo do nível do ator.
              const targetLevel = roles.find((r) => r.id === user.agencyRoleId)?.level
              const manageable =
                !user.isOwner && (targetLevel === undefined || canActOn(targetLevel))
              return (
                <div key={user.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{user.name}</span>
                      {user.isOwner && (
                        <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label="Dono" />
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {user.isOwner ? (
                      <span className="text-xs text-muted-foreground">Acesso total</span>
                    ) : (
                      <Select
                        value={user.agencyRoleId ?? NO_ROLE}
                        onValueChange={(v) => changeUserRole(user.id, v)}
                        disabled={pending || !manageable}
                      >
                        <SelectTrigger className="h-8 w-44 text-sm">
                          <SelectValue placeholder="Sem cargo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ROLE}>Sem cargo</SelectItem>
                          {roles
                            .filter((r) => canActOn(r.level))
                            .map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <RoleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        minLevel={editing ? Math.min(editing.level, minLevel) : minLevel}
        onSaved={() => router.refresh()}
      />
    </>
  )
}
