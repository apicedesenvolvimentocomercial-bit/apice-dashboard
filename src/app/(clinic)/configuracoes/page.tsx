import type { Metadata } from 'next'

import { ClinicSettingsForm } from '@/components/clinic/settings/clinic-settings-form'
import { AppearanceForm } from '@/components/shared/settings/appearance-form'
import { ChangePasswordForm } from '@/components/shared/settings/change-password-form'
import { ProfileForm } from '@/components/shared/settings/profile-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClinicRolesManager } from '@/modules/clinic-roles/clinic-roles-manager'
import { getClinicContext } from '@/server/auth/clinic-context'
import { parseClinicRolePermissions } from '@/server/auth/clinic-permissions'
import { findClientById } from '@/server/repositories/client-repository'
import {
  listClinicRoles,
  listClinicUsers,
  resolveClinicActorLevel,
} from '@/server/repositories/clinic-role-repository'
import { findUserProfileById } from '@/server/repositories/user-repository'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = { title: 'Configurações' }

/**
 * Configurações do DOMÍNIO CLÍNICA (Fase 7 — split do antigo
 * `(account)/settings`). Slug PT `/configuracoes` porque route groups não
 * namespaceiam URL e `/settings` é do admin. Só blocos da clínica: perfil/senha
 * (compartilhados) + dados da clínica (CLIENT_OWNER). `getClinicContext` garante
 * domínio + clientId.
 */
export default async function ClinicSettingsPage() {
  const ctx = await getClinicContext()

  // Pode gerenciar cargos? Titular (coroa) ou cargo com canManageRoles.
  let canManageRoles = ctx.isOwner
  if (!canManageRoles && ctx.clinicRoleId) {
    const role = await prisma.clinicRole.findUnique({
      where: { id: ctx.clinicRoleId },
      select: { canManageRoles: true },
    })
    canManageRoles = !!role?.canManageRoles
  }

  const [profile, client, roles, users, viewerLevel] = await Promise.all([
    findUserProfileById(ctx.userId),
    findClientById(ctx, ctx.clientId),
    canManageRoles ? listClinicRoles(ctx) : Promise.resolve([]),
    canManageRoles ? listClinicUsers(ctx) : Promise.resolve([]),
    canManageRoles ? resolveClinicActorLevel(ctx) : Promise.resolve(null),
  ])
  // Dados sensíveis da clínica: só o TITULAR edita (Bloco B). O card antes usava
  // qualquer CLIENT_OWNER; agora reflete a coroa real.
  const isOwner = ctx.isOwner

  const roleItems = roles.map((r) => ({
    id: r.id,
    name: r.name,
    permissions: parseClinicRolePermissions(r.permissions),
    canManageRoles: r.canManageRoles,
    isSystem: r.isSystem,
    level: r.level,
    userCount: r._count.users,
  }))
  const userItems = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as 'CLIENT_OWNER' | 'CLIENT_STAFF',
    isActive: u.isActive,
    isOwner: u.isOwner,
    clinicRoleId: u.clinicRoleId,
    clinicRoleName: u.clinicRole?.name ?? null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conta e clínica e preferências.</p>
      </div>

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perfil</CardTitle>
            <CardDescription>Seus dados pessoais.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm initial={{ name: profile.name, email: profile.email }} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Senha</CardTitle>
          <CardDescription>Atualize sua senha de acesso.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aparência</CardTitle>
          <CardDescription>Escolha o tema padrão da interface.</CardDescription>
        </CardHeader>
        <CardContent>
          <AppearanceForm />
        </CardContent>
      </Card>

      {client && isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clínica</CardTitle>
            <CardDescription>Dados da sua clínica.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClinicSettingsForm
              clientId={client.id}
              initial={{
                name: client.name,
                email: client.email,
                phone: client.phone,
                city: client.city,
                state: client.state,
                notes: client.notes,
              }}
            />
          </CardContent>
        </Card>
      )}

      {canManageRoles && (
        <ClinicRolesManager
          roles={roleItems}
          users={userItems}
          viewerIsOwner={ctx.isOwner}
          viewerLevel={viewerLevel}
        />
      )}
    </div>
  )
}
