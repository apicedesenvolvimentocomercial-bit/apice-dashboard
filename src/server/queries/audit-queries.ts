import { getTenantContext } from '@/server/tenant/context'
import {
  listAuditLogs,
  listAuditLogsForExport,
  getAuditFilterOptions,
  type AuditLogFilters,
} from '@/server/repositories/audit-repository'

export async function getAuditLogs(filters: AuditLogFilters = {}) {
  const ctx = await getTenantContext()
  return listAuditLogs(ctx, filters)
}

export async function getAuditLogsForExport(filters: AuditLogFilters = {}) {
  const ctx = await getTenantContext()
  return listAuditLogsForExport(ctx, filters)
}

export async function getAuditFilters() {
  const ctx = await getTenantContext()
  return getAuditFilterOptions(ctx)
}
