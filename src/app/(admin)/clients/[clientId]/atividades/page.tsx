import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { ClientClinicActivities } from '@/components/admin/clients/client-clinic-activities'
import { getClient } from '@/server/queries/client-queries'
import { getClientClinicActivities } from '@/server/queries/client-clinic-queries'

export const metadata: Metadata = { title: 'Atividades da clínica' }

type Props = { params: Promise<{ clientId: string }> }

export default async function AdminClientAtividadesPage({ params }: Props) {
  const { clientId } = await params
  const [client, activities] = await Promise.all([
    getClient(clientId),
    getClientClinicActivities(clientId),
  ])

  if (!client) notFound()

  return (
    <ClientClinicActivities
      activities={activities.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        type: a.type,
        status: a.status,
        priority: a.priority,
        dueDate: a.dueDate,
        assignedTo: a.assignedTo,
      }))}
    />
  )
}
