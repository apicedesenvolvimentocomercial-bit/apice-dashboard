import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

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
  const rows = await listStaff(ctx)

  // STAFF tem permissão somente de leitura no módulo `staff` (defaults em
  // server/auth/permissions.ts). UI esconde botões de escrita conforme isso.
  const canWrite = role === 'ADMIN'

  return (
    <div className="space-y-6">
      <StaffList rows={rows} currentUserId={ctx.userId} canWrite={canWrite} />
    </div>
  )
}
