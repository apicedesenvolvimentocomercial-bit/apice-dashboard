'use client'

import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createAgencyRoleAction,
  updateAgencyRoleAction,
} from '@/server/actions/agency-role-actions'
import type { RoleModulePerm, RolePermissions } from '@/server/auth/role-permissions'

import { AGENCY_MODULES } from './agency-modules'

export type RoleDialogInitial = {
  id: string
  name: string
  permissions: RolePermissions
  canManageRoles: boolean
  level: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: RoleDialogInitial // ausente = criar
  onSaved?: () => void
  // Nível mínimo que este cargo pode ter (estritamente abaixo do nível do ator).
  // O criador não pode posicionar um cargo no seu nível ou acima.
  minLevel: number
}

type ModuleState = RoleModulePerm

function blankState(): Record<string, ModuleState> {
  const out: Record<string, ModuleState> = {}
  for (const m of AGENCY_MODULES) out[m.key] = { access: false }
  return out
}

function fromPermissions(perms: RolePermissions): Record<string, ModuleState> {
  const base = blankState()
  for (const m of AGENCY_MODULES) {
    const p = perms[m.key]
    if (p) base[m.key] = { ...p }
  }
  return base
}

export function RoleDialog({ open, onOpenChange, initial, onSaved, minLevel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [canManageRoles, setCanManageRoles] = useState(initial?.canManageRoles ?? false)
  const [level, setLevel] = useState<number>(initial?.level ?? minLevel)
  const [modules, setModules] = useState<Record<string, ModuleState>>(() =>
    initial ? fromPermissions(initial.permissions) : blankState()
  )
  const [pending, startTransition] = useTransition()

  function setAccess(key: string, blocked: boolean) {
    setModules((prev) => ({ ...prev, [key]: blocked ? { access: false } : { access: true } }))
  }

  function toggleAction(key: string, action: keyof RoleModulePerm) {
    setModules((prev) => {
      const cur = prev[key]
      const next: ModuleState = { ...cur, [action]: !cur[action] }
      if (action === 'read' && !next.read) {
        next.write = false
        next.delete = false
        next.assignToOthers = false
        next.viewAll = false
      }
      if (action !== 'read' && action !== 'access' && next[action]) next.read = true
      return { ...prev, [key]: next }
    })
  }

  function save() {
    if (name.trim().length < 2) {
      toast.error('Dê um nome ao cargo (mín. 2 caracteres)')
      return
    }
    if (level < minLevel) {
      toast.error('Nível inválido: não pode ficar no seu nível ou acima')
      return
    }
    const permissions: RolePermissions = {}
    for (const m of AGENCY_MODULES) {
      const s = modules[m.key]
      permissions[m.key] = s.access ? { ...s, access: true } : { access: false }
    }

    startTransition(async () => {
      const result = initial
        ? await updateAgencyRoleAction({
            roleId: initial.id,
            name,
            permissions,
            canManageRoles,
            level,
          })
        : await createAgencyRoleAction({ name, permissions, canManageRoles, level })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success(initial ? 'Cargo atualizado' : 'Cargo criado')
      onOpenChange(false)
      onSaved?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar cargo' : 'Novo cargo'}</DialogTitle>
          <DialogDescription>
            Defina o nome, a posição na hierarquia e as permissões por aba. Bloquear o acesso a uma
            aba esconde-a da barra lateral e bloqueia a rota.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="role-name">Nome do cargo</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Gerente de vendas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-level">Nível</Label>
              <Input
                id="role-level"
                type="number"
                min={minLevel}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                Menor = mais alto. Mín {minLevel}.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={canManageRoles}
              onChange={() => setCanManageRoles((v) => !v)}
            />
            <span>Pode criar cargos e atribuir pessoas (abaixo do próprio nível)</span>
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium">Permissões por aba</p>
            <div className="divide-y rounded-md border">
              {AGENCY_MODULES.map((mod) => {
                const s = modules[mod.key]
                const blocked = !s.access
                return (
                  <div key={mod.key} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {blocked ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <div className="text-sm font-medium">{mod.label}</div>
                          <div className="text-xs text-muted-foreground">{mod.description}</div>
                        </div>
                      </div>
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={blocked}
                          onChange={(e) => setAccess(mod.key, e.target.checked)}
                          aria-label={`Bloquear acesso a ${mod.label}`}
                        />
                        Bloquear acesso
                      </label>
                    </div>

                    {!blocked && (
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 pl-6">
                        <ActionBox
                          label="Ler"
                          checked={!!s.read}
                          onChange={() => toggleAction(mod.key, 'read')}
                        />
                        <ActionBox
                          label="Criar/editar"
                          checked={!!s.write}
                          onChange={() => toggleAction(mod.key, 'write')}
                        />
                        <ActionBox
                          label="Excluir"
                          checked={!!s.delete}
                          onChange={() => toggleAction(mod.key, 'delete')}
                        />
                        {mod.viewAll && (
                          <ActionBox
                            label="Ver de todos"
                            checked={!!s.viewAll}
                            onChange={() => toggleAction(mod.key, 'viewAll')}
                          />
                        )}
                        {mod.assignToOthers && (
                          <ActionBox
                            label="Atribuir a outros"
                            checked={!!s.assignToOthers}
                            onChange={() => toggleAction(mod.key, 'assignToOthers')}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initial ? 'Salvar' : 'Criar cargo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActionBox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <input type="checkbox" className="h-4 w-4" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  )
}
