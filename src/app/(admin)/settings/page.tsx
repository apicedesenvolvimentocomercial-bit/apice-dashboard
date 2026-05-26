import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AppearanceForm } from '@/components/shared/settings/appearance-form'
import { ChangePasswordForm } from '@/components/shared/settings/change-password-form'
import { ProfileForm } from '@/components/shared/settings/profile-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { prisma } from '@/lib/prisma'
import { IntegrationsStatus } from '@/modules/settings/integrations-status'
import { OrganizationForm } from '@/modules/settings/organization-form'
import { ServicePreferencesForm } from '@/modules/settings/service-preferences-form'
import { auth } from '@/server/auth'
import { getAllIntegrationStatuses } from '@/server/integrations'
import { findCurrentOrganization } from '@/server/repositories/organization-repository'
import { findUserProfileById } from '@/server/repositories/user-repository'
import { getTenantContext } from '@/server/tenant/context'

export const metadata: Metadata = { title: 'Configurações' }

/**
 * Configurações do DOMÍNIO ADMIN (Fase 7 — split do antigo `(account)/settings`
 * compartilhado). Só blocos da agência: organização, integrações e
 * preferências de serviço, além de perfil/senha (compartilhados). O branch que
 * resta é permissão intra-admin (ADMIN vs STAFF), não escolha de domínio.
 */
export default async function AdminSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const ctx = await getTenantContext()
  const isAdmin = session.user.role === 'ADMIN'

  const [org, profile, integrations, syncPrefRow] = await Promise.all([
    isAdmin ? findCurrentOrganization(ctx) : Promise.resolve(null),
    findUserProfileById(ctx.userId),
    isAdmin ? getAllIntegrationStatuses() : Promise.resolve([]),
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { activityCalendarSync: true },
    }),
  ])
  const syncPref = syncPrefRow?.activityCalendarSync ?? 'ASK'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conta, organização e preferências.</p>
      </div>

      {org && isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organização</CardTitle>
            <CardDescription>Informações da sua empresa.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationForm initial={{ name: org.name, slug: org.slug }} />
          </CardContent>
        </Card>
      )}

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferências de serviço</CardTitle>
          <CardDescription>Como as suas atividades interagem com o calendário.</CardDescription>
        </CardHeader>
        <CardContent>
          <ServicePreferencesForm initial={syncPref} />
        </CardContent>
      </Card>

      {isAdmin && integrations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Integrações</CardTitle>
            <CardDescription>
              Status dos providers externos. As implementações reais entram em produção sem
              alteração no código consumidor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IntegrationsStatus statuses={integrations} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
