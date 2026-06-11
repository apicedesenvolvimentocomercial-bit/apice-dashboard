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
import {
  DASHBOARD_PERM_KEY,
  NOTIFICATION_PERM_KEY,
  notificationChannelEnabled,
  parseDashboardPermissions,
  parseNotificationPermissions,
  type ClinicModulePerm,
  type ClinicRolePermissions,
  type DashboardPermissions,
  type NotificationPermissions,
} from '@/server/auth/clinic-permissions'

import { CLINIC_MODULES } from './clinic-modules'
import { DASHBOARD_SECTIONS } from './dashboard-catalog'
import { NOTIFICATION_CATEGORIES } from './notification-catalog'

export type RoleDialogInitial = {
  id: string
  name: string
  permissions: ClinicRolePermissions
  canManageRoles: boolean
  level: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: RoleDialogInitial // ausente = criar
  onSaved?: () => void
  // Nível mínimo permitido (estritamente abaixo do nível do ator).
  minLevel: number
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

export function RoleDialog({ open, onOpenChange, initial, onSaved, minLevel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [canManageRoles, setCanManageRoles] = useState(initial?.canManageRoles ?? false)
  // Capacidade SEM aba: convidar pessoas p/ a clínica. Vive na chave `staff`
  // do JSON (o convite exige staff:write via can()); não entra no catálogo de
  // abas — é este checkbox dedicado.
  const [canInvite, setCanInvite] = useState(() => {
    const staff = initial?.permissions?.staff
    return !!staff && staff.access !== false && staff.write === true
  })
  const [level, setLevel] = useState<number>(initial?.level ?? minLevel)
  const [modules, setModules] = useState<Record<string, ModuleState>>(() =>
    initial ? fromPermissions(initial.permissions) : blankState()
  )
  // Visibilidade do dashboard (lacuna 2). Opt-in: começa tudo oculto.
  const [dashboard, setDashboard] = useState<DashboardPermissions>(() =>
    initial ? parseDashboardPermissions(initial.permissions) : {}
  )
  // Preferências de notificação. Opt-out: ausência = ligado (contrário do
  // dashboard) — notificação é útil por padrão, o cargo desliga o que não quer.
  const [notifPrefs, setNotifPrefs] = useState<NotificationPermissions>(() =>
    initial ? parseNotificationPermissions(initial.permissions) : {}
  )
  const [pending, startTransition] = useTransition()

  // Liga/desliga um canal de uma categoria, materializando o outro canal no
  // estado (p/ não perder o valor implícito "ligado" ao gravar objeto parcial).
  function setNotifChannel(cat: string, channel: 'inApp' | 'email', on: boolean) {
    setNotifPrefs((prev) => {
      const inApp = channel === 'inApp' ? on : notificationChannelEnabled(prev, cat, 'inApp')
      const email = channel === 'email' ? on : notificationChannelEnabled(prev, cat, 'email')
      return { ...prev, [cat]: { inApp, email } }
    })
  }

  // Liga/desliga uma seção inteira do dashboard (master). Desligar limpa os
  // itens; ligar deixa items indefinido = todos visíveis dentro da seção.
  function setSectionAccess(section: string, on: boolean) {
    setDashboard((prev) => ({ ...prev, [section]: on ? { access: true } : { access: false } }))
  }

  // Liga/desliga um item dentro de uma seção liberada. Ausência = visível, então
  // só gravamos quando o usuário desmarca (false) ou remarca (true).
  function setSectionItem(section: string, item: string, on: boolean) {
    setDashboard((prev) => {
      const sec = prev[section] ?? { access: true }
      const items = { ...(sec.items ?? {}), [item]: on }
      return { ...prev, [section]: { ...sec, access: true, items } }
    })
  }

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
    // Capacidade de convite (chave `staff`, sem aba na sidebar).
    permissions.staff = canInvite ? { access: true, read: true, write: true } : { access: false }
    // Visibilidade do dashboard vive sob a chave reservada `dashboard`. O cast é
    // necessário porque o tipo do mapa de abas não cobre este shape distinto.
    ;(permissions as Record<string, unknown>)[DASHBOARD_PERM_KEY] = dashboard
    // Preferências de notificação sob a chave reservada `notifications`.
    ;(permissions as Record<string, unknown>)[NOTIFICATION_PERM_KEY] = notifPrefs

    if (level < minLevel) {
      toast.error('Nível inválido: não pode ficar no seu nível ou acima')
      return
    }

    startTransition(async () => {
      const result = initial
        ? await updateClinicRoleAction({
            roleId: initial.id,
            name,
            permissions,
            canManageRoles,
            level,
          })
        : await createClinicRoleAction({ name, permissions, canManageRoles, level })
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
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="role-name">Nome do cargo</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Atendente de caixa"
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
            <span>Pode criar cargos e atribuir pessoas</span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={canInvite}
              onChange={() => setCanInvite((v) => !v)}
            />
            <span>Pode convidar pessoas para a clínica (acesso por email)</span>
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

          <div className="space-y-2">
            <p className="text-sm font-medium">Visibilidade do dashboard</p>
            <p className="text-xs text-muted-foreground">
              Marque as seções que este cargo vê na visão geral. Dentro de cada seção, desmarque
              itens específicos para escondê-los. O titular vê tudo, independente disto.
            </p>
            <div className="divide-y rounded-md border">
              {DASHBOARD_SECTIONS.map((sec) => {
                const on = dashboard[sec.key]?.access === true
                const items = dashboard[sec.key]?.items
                return (
                  <div key={sec.key} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {on ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <div className="text-sm font-medium">{sec.label}</div>
                          <div className="text-xs text-muted-foreground">{sec.description}</div>
                        </div>
                      </div>
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={on}
                          onChange={(e) => setSectionAccess(sec.key, e.target.checked)}
                          aria-label={`Mostrar seção ${sec.label}`}
                        />
                        Mostrar seção
                      </label>
                    </div>

                    {on && (
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 pl-6">
                        {sec.items.map((it) => (
                          <ActionBox
                            key={it.key}
                            label={it.label}
                            // Ausência em items = visível (a seção liga tudo).
                            checked={items?.[it.key] !== false}
                            onChange={() =>
                              setSectionItem(sec.key, it.key, !(items?.[it.key] !== false))
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Notificações</p>
            <p className="text-xs text-muted-foreground">
              O que este cargo recebe no sino (e por email, quando a categoria envia). Tudo vem
              ligado por padrão — desmarque o que não interessa. O titular recebe tudo, independente
              disto.
            </p>
            <div className="divide-y rounded-md border">
              {NOTIFICATION_CATEGORIES.map((cat) => {
                const inApp = notificationChannelEnabled(notifPrefs, cat.key, 'inApp')
                const email = notificationChannelEnabled(notifPrefs, cat.key, 'email')
                return (
                  <div key={cat.key} className="flex items-center justify-between gap-3 p-3">
                    <div>
                      <div className="text-sm font-medium">{cat.label}</div>
                      <div className="text-xs text-muted-foreground">{cat.description}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <ActionBox
                        label="No app"
                        checked={inApp}
                        onChange={() => setNotifChannel(cat.key, 'inApp', !inApp)}
                      />
                      {cat.email && (
                        <ActionBox
                          label="Email"
                          checked={email}
                          onChange={() => setNotifChannel(cat.key, 'email', !email)}
                        />
                      )}
                    </div>
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
