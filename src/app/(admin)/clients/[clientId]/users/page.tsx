import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { auth } from '@/server/auth'
import { ClientUsers } from '@/modules/clients/client-users'
import { getClient, getClinicInvitations, getClinicUsers } from '@/server/queries/client-queries'

export const metadata: Metadata = { title: 'Usuários da clínica' }

type Props = { params: Promise<{ clientId: string }> }

export default async function ClientUsersPage({ params }: Props) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF') {
    redirect('/dashboard')
  }

  const { clientId } = await params
  const client = await getClient(clientId)
  if (!client) notFound()

  const [users, invitations] = await Promise.all([
    getClinicUsers(clientId),
    getClinicInvitations(clientId),
  ])

  return (
    <ClientUsers
      clientId={clientId}
      clientName={client.name}
      currentUserId={session.user.id}
      users={users}
      invitations={invitations}
    />
  )
}
