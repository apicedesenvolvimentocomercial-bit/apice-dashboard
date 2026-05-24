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
  createClinicRoleAction,
  updateClinicRoleAction,
} from '@/server/actions/clinic-role-actions'
import type { ClinicModulePerm, ClinicRolePermissions } from '@/server/auth/clinic-permissions'

import { CLINIC_MODULES } from './clinic-modules'

export type RoleDialogInitial = {
  id: string
  name: string
  permissions: ClinicRolePermissions
  canManageRoles: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: RoleDialogInitial // ausente = criar
  onSaved?: () => void
}

// Estado por aba: access controla o master; o resto são ações.
type ModuleState = ClinicModulePerm

function blankState(): Record<string, ModuleState> {
  const out: Record<string, ModuleState> = {}
  for (const m of CLINIC_MODULES) {
    out[m.key] = { access: false }
  }
  return out
}

function fromPermissions(perms: ClinicRolePermissions): Record<string, ModuleState> {
  const base = blankState()
  for (const m of CLINIC_MODULES) {
    const p = perms[m.key]
    if (p) base[m.key] = { ...p }
  }
  return base
}

export function RoleDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [canManageRoles, setCanManageRoles] = useState(initial?.canManageRoles ?? false)
  const [modules, setModules] = useState<Record<string, ModuleState>>(() =>
    initial ? fromPermissions(initial.permissions) : blankState()
  )
  const [pending, startTransition] = useTransition()

  // Marca "bloquear acesso": access=false zera as sub-ações (recolhe).
  function setAccess(key: string, blocked: boolean) {
    setModules((prev) => ({
      ...prev,
      [key]: blocked ? { access: false } : { access: true },
    }))
  }

  function toggleAction(key: string, action: keyof ClinicModulePerm) {
    setModules((prev) => {
      const cur = prev[key]
      const next: ModuleState = { ...cur, [action]: !cur[action] }
      // Coerência: write/delete/assign/view exigem read.
      if (action === 'read' && !next.read) {
        next.write = false
        next.delete = false
        next.assignToOthers = false
        next.viewAll = false
      }
      if (action !== 'read' && action !== 'access' && next[action]) {
        next.read = true
      }
      return { ...prev, [key]: next }
    })
  }

  function save() {
    if (name.trim().length < 2) {
      toast.error('Dê um nome ao cargo (mín. 2 caracteres)')
      return
    }
    // Só serializa as abas com `access`; as bloqueadas viram { access: false }.
    const permissions: ClinicRolePermissions = {}
    for (const m of CLINIC_MODULES) {
      const s = modules[m.key]
      permissions[m.key] = s.access ? { ...s, access: true } : { access: false }
    }

    startTransition(async () => {
      const result = initial
        ? await updateClinicRoleAction({ roleId: initial.id, name, permissions, canManageRoles })
        : await createClinicRoleAction({ name, permissions, canManageRoles })
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
            Defina o nome e as permissões por aba. Bloquear o acesso a uma aba esconde-a da barra
            lateral e bloqueia a rota.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Nome do cargo</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Atendente de caixa"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={canManageRoles}
              onChange={() => setCanManageRoles((v) => !v)}
            />
            <span>Pode criar cargos e atribuir pessoas</span>
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium">Permissões por aba</p>
            <div className="divide-y rounded-md border">
              {CLINIC_MODULES.map((mod) => {
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

                    {/* Sub-ações recolhem quando a aba está bloqueada. */}
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
