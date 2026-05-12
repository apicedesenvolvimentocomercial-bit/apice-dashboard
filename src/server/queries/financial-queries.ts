import type { CostType } from '@prisma/client'

import { getTenantContext } from '@/server/tenant/context'
import {
  listRevenues,
  getFinancialSummary,
  getMonthlyRevenueCostData,
  getTopProceduresByRevenue,
  getTopCostCategories,
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
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const [summary, chartData, topProcedures, topCostCategories] = await Promise.all([
    getFinancialSummary(ctx, clientId),
    getMonthlyRevenueCostData(ctx, clientId, 12),
    getTopProceduresByRevenue(ctx, clientId, { from: startOfMonth }),
    getTopCostCategories(ctx, clientId, { from: startOfMonth }),
  ])
  return { summary, chartData, topProcedures, topCostCategories }
}

export async function getRevenues(
  clientId: string,
  filters?: {
    from?: string
    to?: string
    paymentMethod?: string
    patientId?: string
    procedureId?: string
  }
) {
  const ctx = await getTenantContext()
  return listRevenues(ctx, clientId, {
    from: filters?.from ? new Date(filters.from) : undefined,
    to: filters?.to ? new Date(filters.to) : undefined,
    paymentMethod: filters?.paymentMethod,
    patientId: filters?.patientId,
    procedureId: filters?.procedureId,
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

export type DreLine = {
  type: 'revenue' | 'cost'
  label: string
  amount: number
}

export type DreReport = {
  from: Date
  to: Date
  revenues: { label: string; amount: number; count: number }[]
  costsByCategory: { label: string; type: CostType; total: number; count: number }[]
  totalRevenue: number
  totalCost: number
  byCostType: { type: CostType; amount: number }[]
  profit: number
  margin: number
}

export async function getDreReport(
  clientId: string,
  filters: { from: Date; to: Date }
): Promise<DreReport> {
  const ctx = await getTenantContext()
  const [revenuesByProc, costsByCat, revenues, costs] = await Promise.all([
    getTopProceduresByRevenue(ctx, clientId, { from: filters.from, to: filters.to, limit: 50 }),
    getTopCostCategories(ctx, clientId, { from: filters.from, to: filters.to, limit: 50 }),
    listRevenues(ctx, clientId, { from: filters.from, to: filters.to }),
    listCosts(ctx, clientId, { from: filters.from, to: filters.to }),
  ])

  const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0)
  const totalCost = costs.reduce((sum, c) => sum + c.amount, 0)

  const costsByType = new Map<CostType, number>()
  for (const c of costs) {
    costsByType.set(c.type, (costsByType.get(c.type) ?? 0) + c.amount)
  }

  // Receitas sem procedimento agrupadas como "Outras"
  const totalFromProcedures = revenuesByProc.reduce((sum, r) => sum + r.total, 0)
  const orphan = totalRevenue - totalFromProcedures
  const revenuesLines = [
    ...revenuesByProc.map((r) => ({ label: r.name, amount: r.total, count: r.count })),
  ]
  if (orphan > 0.01) {
    const orphanCount = revenues.filter((r) => !r.procedure).length
    revenuesLines.push({
      label: 'Outras receitas (sem procedimento)',
      amount: orphan,
      count: orphanCount,
    })
  }

  const profit = totalRevenue - totalCost
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0

  return {
    from: filters.from,
    to: filters.to,
    revenues: revenuesLines,
    costsByCategory: costsByCat,
    totalRevenue,
    totalCost,
    byCostType: Array.from(costsByType.entries()).map(([type, amount]) => ({ type, amount })),
    profit,
    margin,
  }
}
