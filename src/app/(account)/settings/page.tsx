import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChangePasswordForm } from '@/modules/settings/change-password-form'
import { ClinicSettingsForm } from '@/modules/settings/clinic-settings-form'
import { IntegrationsStatus } from '@/modules/settings/integrations-status'
import { OrganizationForm } from '@/modules/settings/organization-form'
import { ProfileForm } from '@/modules/settings/profile-form'
import { auth } from '@/server/auth'
import { getAllIntegrationStatuses } from '@/server/integrations'
import { findClientById } from '@/server/repositories/client-repository'
import { findCurrentOrganization } from '@/server/repositories/organization-repository'
import { findUserProfileById } from '@/server/repositories/user-repository'
import { getTenantContext } from '@/server/tenant/context'

export const metadata: Metadata = { title: 'Configurações' }

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const ctx = await getTenantContext()
  const role = session.user.role
  const isAdminSide = role === 'ADMIN' || role === 'STAFF'

  const [org, profile, integrations, client] = await Promise.all([
    isAdminSide ? findCurrentOrganization(ctx) : Promise.resolve(null),
    findUserProfileById(ctx.userId),
    isAdminSide && role === 'ADMIN' ? getAllIntegrationStatuses() : Promise.resolve([]),
    !isAdminSide && ctx.clientId ? findClientById(ctx, ctx.clientId) : Promise.resolve(null),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie sua conta{isAdminSide ? ', organização' : ' e clínica'} e preferências.
        </p>
      </div>

      {org && role === 'ADMIN' && (
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

      {client && role === 'CLIENT_OWNER' && (
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

      {role === 'ADMIN' && integrations.length > 0 && (
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
