import type { CostType } from '@prisma/client'

import { getTenantContext } from '@/server/tenant/context'
import {
  listRevenues,
  getFinancialSummary,
  getMonthlyRevenueCostData,
} from '@/server/repositories/revenue-repository'
import { listCosts } from '@/server/repositories/cost-repository'
import {
  listProceduresWithStats,
  listProceduresForSelect,
  listCategories,
} from '@/server/repositories/procedure-repository'
import { listPatients } from '@/server/repositories/patient-repository'

export async function getFinancialOverview(clientId: string) {
  const ctx = await getTenantContext()
  const [summary, chartData] = await Promise.all([
    getFinancialSummary(ctx, clientId),
    getMonthlyRevenueCostData(ctx, clientId, 12),
  ])
  return { summary, chartData }
}

export async function getRevenues(clientId: string, filters?: { from?: string; to?: string }) {
  const ctx = await getTenantContext()
  return listRevenues(ctx, clientId, {
    from: filters?.from ? new Date(filters.from) : undefined,
    to: filters?.to ? new Date(filters.to) : undefined,
  })
}

export async function getCosts(
  clientId: string,
  filters?: { from?: string; to?: string; type?: CostType }
) {
  const ctx = await getTenantContext()
  return listCosts(ctx, clientId, {
    from: filters?.from ? new Date(filters.from) : undefined,
    to: filters?.to ? new Date(filters.to) : undefined,
    type: filters?.type,
  })
}

export async function getProceduresWithStats(clientId: string) {
  const ctx = await getTenantContext()
  return listProceduresWithStats(ctx, clientId)
}

export async function getProceduresForSelect(clientId: string) {
  const ctx = await getTenantContext()
  return listProceduresForSelect(ctx, clientId)
}

export async function getProcedureCategories(clientId: string) {
  const ctx = await getTenantContext()
  return listCategories(ctx, clientId)
}

export async function getPatientsForSelect(clientId: string) {
  const ctx = await getTenantContext()
  const patients = await listPatients(ctx, clientId)
  return patients.map((p) => ({ id: p.id, name: p.name }))
}
