import type { Metadata } from 'next'

import { AppearanceSection } from '@/components/clinic/settings/appearance-section'
import { ClinicSettingsForm } from '@/components/clinic/settings/clinic-settings-form'
import {
  ClinicSettingsShell,
  type SettingsSectionKey,
} from '@/components/clinic/settings/clinic-settings-shell'
import { CreditReceiptConfigCard } from '@/components/clinic/settings/credit-receipt-config-card'
import { MessageTemplatesCard } from '@/components/clinic/settings/message-templates-card'
import { PeopleSection } from '@/components/clinic/settings/people-section'
import { ProfileSection } from '@/components/clinic/settings/profile-section'
import { WebhookTokenCard } from '@/components/clinic/settings/webhook-token-card'
import { getClinicMessaging } from '@/server/queries/messaging-queries'
import { env } from '@/lib/env'
import { ClinicRolesManager } from '@/modules/clinic-roles/clinic-roles-manager'
import { can } from '@/server/auth/permissions'
import { getClinicContext } from '@/server/auth/clinic-context'
import { parseClinicRolePermissions } from '@/server/auth/clinic-permissions'
import { findClientById } from '@/server/repositories/client-repository'
import {
  listClinicRoles,
  listClinicUsers,
  resolveClinicActorLevel,
} from '@/server/repositories/clinic-role-repository'
import { findUserProfileById } from '@/server/repositories/user-repository'
import { parseCreditFeeTiers } from '@/lib/credit-fee'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = { title: 'Configurações' }

/**
 * Configurações do DOMÍNIO CLÍNICA — redesign Senno (prompt/Senno Redesign/
 * Configurações): coluna centralizada de 940px com busca de configuração +
 * chips de categoria; cada categoria é uma seção-card. O h1 vive no topbar
 * (chrome do layout), não aqui.
 *
 * Slug PT `/configuracoes` porque route groups não namespaceiam URL e
 * `/settings` é do admin. Gates por seção (inalterados do split da Fase 7):
 * perfil/aparência p/ todos; clínica/pagamento/webhooks/retenção só o TITULAR
 * (coroa); pessoas exige `staff:write`; cargos/usuários exigem canManageRoles.
 * O shell só mostra chip de seção presente — quem não vê a seção não vê o chip.
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

  // Pode CONVIDAR pessoas? Titular ou cargo com staff:write (checkbox "Pode
  // convidar pessoas" do cargo). Independente de canManageRoles.
  const canInvite = ctx.isOwner || (await can(ctx.userId, ctx.role, 'staff', 'write'))

  // Dados sensíveis da clínica: só o TITULAR edita (Bloco B).
  const isOwner = ctx.isOwner

  const [
    profile,
    client,
    roles,
    users,
    viewerLevel,
    webhookCfg,
    messaging,
    activeMembers,
    pendingInvites,
  ] = await Promise.all([
    findUserProfileById(ctx.userId),
    findClientById(ctx, ctx.clientId),
    canManageRoles ? listClinicRoles(ctx) : Promise.resolve([]),
    canManageRoles ? listClinicUsers(ctx) : Promise.resolve([]),
    canManageRoles ? resolveClinicActorLevel(ctx) : Promise.resolve(null),
    isOwner
      ? prisma.client.findUnique({
          where: { id: ctx.clientId },
          select: { webhookTokenHash: true },
        })
      : Promise.resolve(null),
    isOwner ? getClinicMessaging(ctx.clientId) : Promise.resolve(null),
    // Contagens do banner de Pessoas (handoff §13.1 — no protótipo era texto
    // fixo; aqui deriva dos dados). Belt: filtro por clientId explícito.
    canInvite
      ? prisma.user.count({
          where: {
            clientId: ctx.clientId,
            role: { in: ['CLIENT_OWNER', 'CLIENT_STAFF'] },
            isActive: true,
            deletedAt: null,
          },
        })
      : Promise.resolve(0),
    canInvite
      ? prisma.invitation.count({
          where: { clientId: ctx.clientId, acceptedAt: null, expiresAt: { gt: new Date() } },
        })
      : Promise.resolve(0),
  ])

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

  // Seções na ordem dos chips; ausente = sem chip (gate por cargo/coroa).
  const sections: Partial<Record<SettingsSectionKey, React.ReactNode>> = {}

  if (profile) {
    sections.perfil = <ProfileSection initial={{ name: profile.name, email: profile.email }} />
  }
  sections.aparencia = <AppearanceSection />
  if (client && isOwner) {
    sections.clinica = (
      <ClinicSettingsForm
        clientId={client.id}
        initial={{
          name: client.name,
          email: client.email,
          phone: client.phone,
          city: client.city,
          state: client.state,
          notes: client.notes,
          taxRegime: client.taxRegime,
          cnae: client.cnae,
        }}
      />
    )
    sections.pagamento = (
      <CreditReceiptConfigCard
        initialMode={client.creditReceiptMode}
        initialTiers={parseCreditFeeTiers(client.creditFeeTiers)}
      />
    )
  }
  if (isOwner) {
    sections.webhooks = (
      <WebhookTokenCard
        hasToken={!!webhookCfg?.webhookTokenHash}
        appUrl={env.NEXT_PUBLIC_APP_URL}
      />
    )
  }
  if (isOwner && messaging) {
    sections.retencao = (
      <MessageTemplatesCard
        clientId={ctx.clientId}
        operationMode={messaging.operationMode}
        templates={messaging.templates}
        recent={messaging.recent}
      />
    )
  }
  if (canInvite) {
    sections.pessoas = (
      <PeopleSection
        clientId={ctx.clientId}
        activeMembers={activeMembers}
        pendingInvites={pendingInvites}
      />
    )
  }
  if (canManageRoles) {
    sections.cargos = (
      <ClinicRolesManager
        only="roles"
        roles={roleItems}
        users={userItems}
        viewerIsOwner={ctx.isOwner}
        viewerLevel={viewerLevel}
      />
    )
    sections.usuarios = (
      <ClinicRolesManager
        only="users"
        roles={roleItems}
        users={userItems}
        viewerIsOwner={ctx.isOwner}
        viewerLevel={viewerLevel}
      />
    )
  }

  return <ClinicSettingsShell sections={sections} />
}
