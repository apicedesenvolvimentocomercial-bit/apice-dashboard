'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { fail, runAction } from '@/types/errors'
import { getTenantContext } from '@/server/tenant/context'
import { assertMutationBudget } from '@/server/security/mutation-throttle'

const syncSchema = z.enum(['AUTO', 'ASK', 'NEVER'])

export async function updateActivityCalendarSyncAction(value: unknown) {
  const parsed = syncSchema.safeParse(value)
  if (!parsed.success) return fail('Opção inválida')

  return runAction(async () => {
    const ctx = await getTenantContext()
    // Preferência do próprio usuário — sem assertCan, rate-limit explícito.
    await assertMutationBudget(ctx.userId)
    await prisma.user.update({
      where: { id: ctx.userId },
      data: { activityCalendarSync: parsed.data },
    })
    revalidatePath('/settings')
    revalidatePath('/activities')
    revalidatePath('/calendar')
    return null
  })
}
