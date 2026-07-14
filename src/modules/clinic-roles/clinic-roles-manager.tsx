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
import { Crown, GripVertical, Loader2, Pencil, Plus, Shield, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  SETTINGS_BTN_PRIMARY,
  SettingsSectionCard,
} from '@/components/clinic/settings/section-card'
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

/**
 * Cargos e permissões + Usuários da clínica — redesign Senno (Configurações-
 * handoff §14/§15). Linhas de cargo com grip + tile de escudo dourado +
 * ações Editar/Excluir (hover destrutivo); arraste com feedback opacity .5 +
 * borda dourada (dnd-kit, mesmo visual do protótipo). Usuários: coroa
 * `primary-text` no titular ("Acesso total"), select de cargo 172px nos
 * demais + "Tornar titular" (fora do protótipo — funcionalidade existente).
 *
 * `only` separa os dois cards em chips distintos da tela de Configurações
 * ('roles' | 'users'); sem ela renderiza ambos (compat).
 */

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
  /** Renderiza só um dos cards (chips separados em /configuracoes). */
  only?: 'roles' | 'users'
}

const NO_ROLE = '__none__'

export function ClinicRolesManager({ roles, users, viewerIsOwner, viewerLevel, only }: Props) {
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

  const showRoles = only !== 'users'
  const showUsers = only !== 'roles'

  return (
    <>
      {showRoles && (
        <SettingsSectionCard
          title="Cargos e permissões"
          description="Arraste para reordenar a hierarquia — cargos no topo têm mais permissões. O titular tem acesso total."
          headerRight={
            <button type="button" className={SETTINGS_BTN_PRIMARY} onClick={openCreate}>
              <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
              Novo cargo
            </button>
          }
        >
          {roles.length === 0 ? (
            // Vazio composto (design.md §5) — nunca só "vazio".
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-background px-6 py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.14] text-primary-text">
                <Shield className="h-[22px] w-[22px]" aria-hidden="true" />
              </div>
              <p className="m-0 text-[14px] font-semibold">Nenhum cargo criado ainda</p>
              <p className="m-0 max-w-sm text-[12.5px] leading-[1.55] text-muted-foreground">
                Crie o primeiro cargo para liberar abas e permissões à equipe — quem está sem cargo
                não acessa nada.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-[9px]">
                {staticRoles.map((role) => (
                  <div key={role.id} className={roleRowCls(false)}>
                    {/* Sem grip: cargo de sistema ou acima do nível do ator. */}
                    <RoleTile />
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
                <p className="m-0 mt-2.5 text-xs text-muted-foreground">
                  Arraste pelo <GripVertical className="inline h-3 w-3" aria-hidden="true" /> para
                  reordenar a hierarquia (mais alto no topo).
                </p>
              )}
            </>
          )}
        </SettingsSectionCard>
      )}

      {showUsers && (
        <SettingsSectionCard
          title="Usuários da clínica"
          description="Atribua um cargo a cada usuário interno."
        >
          <div>
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-4 border-b border-border px-0.5 py-3.5 last:border-b-0 last:pb-1"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-[7px]">
                    <span className="truncate text-[13.5px] font-semibold">{user.name}</span>
                    {user.isOwner && (
                      <Crown
                        className="h-[15px] w-[15px] shrink-0 text-primary-text"
                        aria-label="Titular"
                      />
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                    {user.email}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {user.isOwner ? (
                    <span className="text-[13.5px] text-muted-foreground">Acesso total</span>
                  ) : (
                    <Select
                      value={user.clinicRoleId ?? NO_ROLE}
                      onValueChange={(v) => changeUserRole(user.id, v)}
                      disabled={pending}
                    >
                      <SelectTrigger className="h-9 w-[172px] rounded-[9px] border-input bg-background text-[13px]">
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
                    <button
                      type="button"
                      onClick={() => transferOwnership(user)}
                      disabled={pending}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                    >
                      {pending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Crown className="h-3.5 w-3.5 text-primary-text" aria-hidden="true" />
                      )}
                      Tornar titular
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SettingsSectionCard>
      )}

      {showRoles && (
        <RoleDialog
          // Remonta por cargo: o estado interno é semeado por `initial` só no mount.
          // Sem `key`, trocar `editing` mantinha o estado do cargo anterior (nome/perms
          // grudados, config "sumindo" ao reabrir um cargo já configurado).
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initial={editing}
          minLevel={editing ? Math.min(editing.level, minLevel) : minLevel}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  )
}

// Linha de cargo (§14.1): fundo `background`, radius 11, feedback dourado no arraste.
function roleRowCls(dragging: boolean) {
  return cn(
    'flex items-center gap-[13px] rounded-[11px] border bg-background px-3.5 py-3 transition-colors',
    dragging ? 'border-primary/60 opacity-50' : 'border-border'
  )
}

function RoleTile() {
  return (
    <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-primary/[0.14] text-primary-text">
      <Shield className="h-[15px] w-[15px]" aria-hidden="true" />
    </div>
  )
}

function RoleInfo({ role }: { role: RoleItem }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-[13.5px] font-semibold">{role.name}</div>
      <div className="mt-px text-xs text-muted-foreground">
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
    <div className="flex flex-none items-center gap-1.5">
      <button
        type="button"
        title="Editar"
        onClick={() => onEdit(role)}
        disabled={pending}
        aria-label={`Editar ${role.name}`}
        className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
      >
        <Pencil className="h-[15px] w-[15px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Excluir"
        onClick={() => onRemove(role)}
        disabled={pending}
        aria-label={`Excluir ${role.name}`}
        className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
      >
        <Trash2 className="h-[15px] w-[15px]" aria-hidden="true" />
      </button>
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
      className={cn(roleRowCls(isDragging), isDragging && 'z-10')}
    >
      <button
        type="button"
        title="Arraste para reordenar"
        className="flex-none cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Arrastar ${role.name} para reordenar`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      <RoleTile />
      <RoleInfo role={role} />
      <RoleControls role={role} pending={pending} onEdit={onEdit} onRemove={onRemove} />
    </div>
  )
}
