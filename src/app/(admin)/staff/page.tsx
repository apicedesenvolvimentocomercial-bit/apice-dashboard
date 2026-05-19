import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { prisma } from '@/lib/prisma'
import { auth } from '@/server/auth'
import { StaffList } from '@/modules/staff/staff-list'
import { listStaff } from '@/server/repositories/user-repository'
import { getTenantContext } from '@/server/tenant/context'

export const metadata: Metadata = { title: 'Equipe' }

export default async function StaffPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'STAFF') redirect('/dashboard')

  const ctx = await getTenantContext()
  const [rows, org] = await Promise.all([
    listStaff(ctx),
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { ownerId: true },
    }),
  ])

  // STAFF tem permissão somente de leitura no módulo `staff` (defaults em
  // server/auth/permissions.ts). UI esconde botões de escrita conforme isso.
  const canWrite = role === 'ADMIN'
  const ownerId = org?.ownerId ?? null
  const currentUserIsOwner = ownerId === ctx.userId

  return (
    <div className="space-y-6">
      <StaffList
        rows={rows}
        currentUserId={ctx.userId}
        canWrite={canWrite}
        ownerId={ownerId}
        currentUserIsOwner={currentUserIsOwner}
      />
    </div>
  )
}
