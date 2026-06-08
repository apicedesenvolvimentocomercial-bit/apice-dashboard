import type { CostType } from '@prisma/client'

import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { assertCan } from '@/server/auth/assert-can'
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
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'financial', 'read')
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
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'financial', 'read')
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
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'financial', 'read')
  return listCosts(ctx, clientId, {
    from: filters?.from ? new Date(filters.from) : undefined,
    to: filters?.to ? new Date(filters.to) : undefined,
    type: filters?.type,
  })
}

export async function getProceduresWithStats(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'procedures', 'read')
  return listProceduresWithStats(ctx, clientId)
}

export async function getProceduresForSelect(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'procedures', 'read')
  return listProceduresForSelect(ctx, clientId)
}

export async function getProcedureCategories(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'procedures', 'read')
  return listCategories(ctx, clientId)
}

export async function getPatientsForSelect(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'patients', 'read')
  const patients = await listPatients(ctx, clientId)
  return patients.map((p) => ({ id: p.id, name: p.name }))
}

// (DRE simplificada removida — a DRE em competência vive em `dre-queries.ts` e na
// aba DRE do Financeiro; a antiga aba "Relatórios" foi unificada nela.)
