import { assertCan } from '@/server/auth/assert-can'
import { buildDreInput } from '@/server/services/dre/build-dre-input'
import { calcularDRE, type DREInput, type DREOutput } from '@/server/services/dre/calcular-dre'
import { resolvePeriod } from '@/server/services/kpi/period'
import type { Period } from '@/server/services/kpi/types'
import { enterClientScope } from '@/server/tenant/client-scope'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'

export type DreReport = {
  range: { from: Date; to: Date }
  input: DREInput
  output: DREOutput
}

/**
 * DRE de UMA clínica para um período (competência). Gate `financial:read` +
 * `assertClientAccess` + `enterClientScope` (liga a RLS — esta query também é
 * chamável pelo admin numa clínica específica). Ver dre-progresso.md.
 */
export async function getDreReport(
  clientId: string,
  opts?: { period?: Period; from?: string; to?: string }
): Promise<DreReport> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'read')

  const range = resolvePeriod(opts?.period ?? 'month', new Date(), {
    from: opts?.from,
    to: opts?.to,
  })
  const input = await buildDreInput(ctx, clientId, range)
  return { range: { from: range.from, to: range.to }, input, output: calcularDRE(input) }
}
