'use server'

import { z } from 'zod'

import { dateRangeFromIsoStrings } from '@/lib/date'
import { fail, ok } from '@/types/errors'
import { getDreReport } from '@/server/queries/financial-queries'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'

const dreSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
})

export async function generateDreAction(clientId: string, input: { from: string; to: string }) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'reports', 'read')

  const parsed = dreSchema.safeParse(input)
  if (!parsed.success) return fail('Período inválido')

  let range: { from: Date; to: Date }
  try {
    range = dateRangeFromIsoStrings(parsed.data.from, parsed.data.to)
  } catch {
    return fail('Datas inválidas')
  }
  if (range.from > range.to) return fail('Data inicial maior que a final')

  const dre = await getDreReport(clientId, range)

  return ok({
    from: parsed.data.from,
    to: parsed.data.to,
    revenues: dre.revenues,
    costsByCategory: dre.costsByCategory.map((c) => ({
      label: c.label,
      type: String(c.type),
      amount: c.total,
      count: c.count,
    })),
    totalRevenue: dre.totalRevenue,
    totalCost: dre.totalCost,
    byCostType: dre.byCostType.map((c) => ({ type: String(c.type), amount: c.amount })),
    profit: dre.profit,
    margin: dre.margin,
  })
}
