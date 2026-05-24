import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { auth } from '@/server/auth'
import { getAuditLogs, getAuditFilters } from '@/server/queries/audit-queries'
import { AuditLogShell } from '@/modules/audit/audit-log-shell'
import type { AuditAction, AuditEntityType } from '@/server/repositories/audit-repository'

export const metadata: Metadata = { title: 'Audit Log' }

const PAGE_SIZE = 50

type Props = {
  searchParams: Promise<{
    page?: string
    from?: string
    to?: string
    action?: string
    entityType?: string
    userId?: string
    clientId?: string
  }>
}

export default async function AuditLogPage({ searchParams }: Props) {
  const session = await auth()
  if (session?.user?.role !== 'ADMIN') redirect('/dashboard')

  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const skip = (page - 1) * PAGE_SIZE

  const [{ rows, total }, filterOptions] = await Promise.all([
    getAuditLogs({
      from: sp.from ? new Date(sp.from) : undefined,
      to: sp.to ? new Date(sp.to + 'T23:59:59') : undefined,
      action: sp.action as AuditAction | undefined,
      entityType: sp.entityType as AuditEntityType | undefined,
      userId: sp.userId || undefined,
      clientId: sp.clientId || undefined,
      take: PAGE_SIZE,
      skip,
    }),
    getAuditFilters(),
  ])

  const serialized = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt,
    changes: r.changes as Record<string, unknown> | null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">Histórico de todas as ações realizadas no sistema.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registros de auditoria</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditLogShell
            rows={serialized}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            users={filterOptions.users}
            clients={filterOptions.clients}
          />
        </CardContent>
      </Card>
    </div>
  )
}
