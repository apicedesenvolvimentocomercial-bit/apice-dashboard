'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { fail, ok, runAction } from '@/types/errors'
import type { Result } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { getTenantContext } from '@/server/tenant/context'
import { deleteOrgHoliday, upsertOrgHoliday } from '@/server/repositories/org-holiday-repository'

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  name: z
    .string()
    .min(1, 'Nome obrigatório')
    .max(255, 'Nome muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O nome contém caracteres inválidos'
    ),
})

function revalidate() {
  revalidatePath('/calendar')
}

export async function addOrgHolidayAction(input: unknown) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    // Apenas admin gerencia feriados da org. STAFF só visualiza.
    if (ctx.role !== 'ADMIN') return fail('Apenas ADMIN pode gerenciar feriados')
    await assertCan(ctx, 'activities', 'write')

    const parsed = holidaySchema.safeParse(input)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos')

    await upsertOrgHoliday(ctx, parsed.data)
    revalidate()
    return null
  })
}

export async function addOrgHolidaysBulkAction(
  holidays: { date: string; name: string }[]
): Promise<Result<{ added: number }>> {
  const ctx = await getTenantContext()
  if (ctx.role !== 'ADMIN') return fail('Apenas ADMIN pode gerenciar feriados')
  await assertCan(ctx, 'activities', 'write')

  const valid = holidays
    .map((h) => holidaySchema.safeParse(h))
    .filter((r): r is z.SafeParseSuccess<{ date: string; name: string }> => r.success)
    .map((r) => r.data)

  if (valid.length === 0) return fail('Nenhum feriado válido para importar')

  let added = 0
  for (const h of valid) {
    await upsertOrgHoliday(ctx, h)
    added++
  }

  revalidate()
  return ok({ added })
}

export async function removeOrgHolidayAction(holidayId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    if (ctx.role !== 'ADMIN') return fail('Apenas ADMIN pode gerenciar feriados')
    await assertCan(ctx, 'activities', 'write')

    await deleteOrgHoliday(ctx, holidayId)
    revalidate()
    return null
  })
}
