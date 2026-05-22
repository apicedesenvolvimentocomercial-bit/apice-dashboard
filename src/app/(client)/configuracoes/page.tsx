import type { Metadata } from 'next'

import { ClinicSettingsForm } from '@/components/clinic/settings/clinic-settings-form'
import { ChangePasswordForm } from '@/components/shared/settings/change-password-form'
import { ProfileForm } from '@/components/shared/settings/profile-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getClinicContext } from '@/server/auth/clinic-context'
import { findClientById } from '@/server/repositories/client-repository'
import { findUserProfileById } from '@/server/repositories/user-repository'

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

  const [profile, client] = await Promise.all([
    findUserProfileById(ctx.userId),
    findClientById(ctx, ctx.clientId),
  ])
  const isOwner = ctx.role === 'CLIENT_OWNER'

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
    </div>
  )
}
