'use client'

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Crown, GripVertical, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
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
  reorderClinicRolesAction,
} from '@/server/actions/clinic-role-actions'
import { transferClinicOwnershipAction } from '@/server/actions/clinic-owner-actions'
import type { ClinicRolePermissions } from '@/server/auth/clinic-permissions'
import { cn } from '@/lib/utils'

import { RoleDialog, type RoleDialogInitial } from './role-dialog'

export type RoleItem = {
  id: string
  name: string
  permissions: ClinicRolePermissions
  canManageRoles: boolean
  isSystem: boolean
  level: number
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
  // Nível do ator (null = titular, acima de tudo). Controla mínimo de nível ao
  // criar e quais cargos pode editar/atribuir.
  viewerLevel: number | null
}

const NO_ROLE = '__none__'

export function ClinicRolesManager({ roles, users, viewerIsOwner, viewerLevel }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RoleDialogInitial | undefined>(undefined)
  const [pending, startTransition] = useTransition()

  // Drag-drop da hierarquia (item 8). Só cargos que o ator gerencia (não-sistema,
  // level abaixo do seu) são arrastáveis; o resto fica fixo no topo.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const isManageable = (r: RoleItem) =>
    !r.isSystem && (viewerLevel === null || r.level > viewerLevel)
  const staticRoles = roles.filter((r) => !isManageable(r))
  const [sortable, setSortable] = useState<RoleItem[]>(() => roles.filter(isManageable))
  const [reordering, startReorder] = useTransition()

  // Re-sincroniza com o servidor quando a lista muda (criar/editar/excluir).
  useEffect(() => {
    setSortable(roles.filter((r) => !r.isSystem && (viewerLevel === null || r.level > viewerLevel)))
  }, [roles, viewerLevel])

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = sortable.findIndex((r) => r.id === active.id)
    const newIdx = sortable.findIndex((r) => r.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const prev = sortable
    const next = arrayMove(sortable, oldIdx, newIdx)
    setSortable(next) // otimista
    startReorder(async () => {
      const res = await reorderClinicRolesAction({ orderedIds: next.map((r) => r.id) })
      if (!res.success) {
        toast.error(res.error.message)
        setSortable(prev)
        return
      }
      toast.success('Hierarquia atualizada')
      router.refresh()
    })
  }

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

  // Menor nível que o ator pode criar (estritamente abaixo do seu).
  const minLevel = viewerLevel === null ? 1 : viewerLevel + 1

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
            <>
              <div className="divide-y rounded-md border">
                {staticRoles.map((role) => (
                  <div
                    key={role.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <RoleInfo role={role} />
                    <RoleControls
                      role={role}
                      pending={pending}
                      onEdit={openEdit}
                      onRemove={removeRole}
                    />
                  </div>
                ))}
                <DndContext
                  id="clinic-roles-dnd"
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortable.map((r) => r.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sortable.map((role) => (
                      <SortableRoleRow
                        key={role.id}
                        role={role}
                        pending={pending || reordering}
                        onEdit={openEdit}
                        onRemove={removeRole}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
              {sortable.length > 1 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Arraste pelo <GripVertical className="inline h-3 w-3" /> para reordenar a
                  hierarquia (mais alto no topo).
                </p>
              )}
            </>
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
        minLevel={editing ? Math.min(editing.level, minLevel) : minLevel}
        onSaved={() => router.refresh()}
      />
    </>
  )
}

function RoleInfo({ role }: { role: RoleItem }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium">{role.name}</div>
      <div className="text-xs text-muted-foreground">
        {role.userCount} usuário{role.userCount !== 1 ? 's' : ''}
        {role.canManageRoles ? ' · pode gerenciar cargos' : ''}
      </div>
    </div>
  )
}

function RoleControls({
  role,
  pending,
  onEdit,
  onRemove,
}: {
  role: RoleItem
  pending: boolean
  onEdit: (r: RoleItem) => void
  onRemove: (r: RoleItem) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onEdit(role)}
        disabled={pending}
        aria-label={`Editar ${role.name}`}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-rose-600 hover:text-rose-700"
        onClick={() => onRemove(role)}
        disabled={pending}
        aria-label={`Excluir ${role.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

function SortableRoleRow({
  role,
  pending,
  onEdit,
  onRemove,
}: {
  role: RoleItem
  pending: boolean
  onEdit: (r: RoleItem) => void
  onRemove: (r: RoleItem) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: role.id,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center justify-between gap-3 bg-background px-3 py-2.5',
        isDragging && 'relative z-10 rounded-md opacity-80 shadow-md'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Arrastar ${role.name} para reordenar`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <RoleInfo role={role} />
      </div>
      <RoleControls role={role} pending={pending} onEdit={onEdit} onRemove={onRemove} />
    </div>
  )
}
