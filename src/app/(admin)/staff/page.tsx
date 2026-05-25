import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { prisma } from '@/lib/prisma'
import { auth } from '@/server/auth'
import { StaffList } from '@/modules/staff/staff-list'
import { AgencyRolesManager } from '@/modules/agency-roles/agency-roles-manager'
import { getAdminContext } from '@/server/auth/admin-context'
import { assertAgencyTabAccess } from '@/server/auth/agency-tabs'
import { parseRolePermissions } from '@/server/auth/role-permissions'
import { listStaff } from '@/server/repositories/user-repository'
import {
  listAgencyRoles,
  listAgencyUsers,
  resolveActorLevel,
} from '@/server/repositories/agency-role-repository'

export const metadata: Metadata = { title: 'Equipe' }

export default async function StaffPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const ctx = await getAdminContext()
  await assertAgencyTabAccess(ctx, 'staff')

  // Só quem pode gerenciar cargos vê o card de cargos: ADMIN/titular, ou STAFF
  // com cargo canManageRoles. (A lista de equipe segue visível conforme a aba.)
  let canManageRoles = ctx.isOwner || ctx.role === 'ADMIN'
  if (!canManageRoles && ctx.agencyRoleId) {
    const role = await prisma.agencyRole.findUnique({
      where: { id: ctx.agencyRoleId },
      select: { canManageRoles: true },
    })
    canManageRoles = role?.canManageRoles ?? false
  }

  const [rows, org, roles, agencyUsers, viewerLevel] = await Promise.all([
    listStaff(ctx),
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { ownerId: true },
    }),
    canManageRoles ? listAgencyRoles(ctx) : Promise.resolve([]),
    canManageRoles ? listAgencyUsers(ctx) : Promise.resolve([]),
    canManageRoles ? resolveActorLevel(ctx) : Promise.resolve(null),
  ])

  const ownerId = org?.ownerId ?? null
  const currentUserIsOwner = ownerId === ctx.userId
  // STAFF sem poder de mutação não vê botões de escrita na lista.
  const canWrite = ctx.role === 'ADMIN'

  return (
    <div className="space-y-6">
      <StaffList
        rows={rows}
        currentUserId={ctx.userId}
        canWrite={canWrite}
        ownerId={ownerId}
        currentUserIsOwner={currentUserIsOwner}
      />

      {canManageRoles && (
        <AgencyRolesManager
          roles={roles.map((r) => ({
            id: r.id,
            name: r.name,
            permissions: parseRolePermissions(r.permissions),
            canManageRoles: r.canManageRoles,
            level: r.level,
            userCount: r._count.users,
          }))}
          users={agencyUsers.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role as 'ADMIN' | 'STAFF',
            isActive: u.isActive,
            isOwner: u.isOwner,
            agencyRoleId: u.agencyRoleId,
            agencyRoleName: u.agencyRole?.name ?? null,
          }))}
          viewerLevel={viewerLevel}
        />
      )}
    </div>
  )
}
