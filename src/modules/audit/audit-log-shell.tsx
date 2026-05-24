'use client'

import { useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

import { AuditLogTable } from './audit-log-table'

type AuditRow = {
  id: string
  action: string
  entityType: string
  entityId: string | null
  createdAt: Date
  user: { name: string; email: string; role: string } | null
  changes: Record<string, unknown> | null
}

type Props = {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  users: { id: string; name: string; email: string }[]
  clients: { id: string; name: string }[]
}

export function AuditLogShell({ rows, total, page, pageSize, users, clients }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParams = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const handlePageChange = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('page', String(newPage))
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <AuditLogTable
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      users={users}
      clients={clients}
      initialFilters={{
        userId: searchParams.get('userId') ?? '__all__',
        clientId: searchParams.get('clientId') ?? '__all__',
        action: searchParams.get('action') ?? '__all__',
        entityType: searchParams.get('entityType') ?? '__all__',
        from: searchParams.get('from') ?? '',
        to: searchParams.get('to') ?? '',
      }}
      onPageChange={handlePageChange}
      onFilterChange={(filters) =>
        updateParams({
          from: filters.from,
          to: filters.to,
          action: filters.action,
          entityType: filters.entityType,
          userId: filters.userId,
          clientId: filters.clientId,
        })
      }
    />
  )
}
