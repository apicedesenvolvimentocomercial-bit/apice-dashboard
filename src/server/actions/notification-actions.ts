'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { runAction, ValidationError } from '@/types/errors'
import { getTenantContext } from '@/server/tenant/context'
import { assertMutationBudget } from '@/server/security/mutation-throttle'
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/server/repositories/notification-repository'

// Estas actions não passam por assertCan (operam nos avisos do PRÓPRIO usuário)
// → o rate-limit anti-DoS de mutação entra explícito em cada uma.

const idSchema = z.string().min(1).max(64)

function parseId(value: string): string {
  const parsed = idSchema.safeParse(value)
  if (!parsed.success) throw new ValidationError('Notificação inválida')
  return parsed.data
}

export async function markNotificationReadAction(notificationId: string) {
  return runAction(async () => {
    const id = parseId(notificationId)
    const ctx = await getTenantContext()
    await assertMutationBudget(ctx.userId)
    await markNotificationRead(ctx.userId, id)
    revalidatePath('/dashboard')
    revalidatePath('/overview')
    revalidatePath('/notifications')
    return null
  })
}

export async function markAllReadAction() {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertMutationBudget(ctx.userId)
    await markAllNotificationsRead(ctx.userId)
    revalidatePath('/dashboard')
    revalidatePath('/overview')
    revalidatePath('/notifications')
    return null
  })
}

export async function deleteNotificationAction(notificationId: string) {
  return runAction(async () => {
    const id = parseId(notificationId)
    const ctx = await getTenantContext()
    await assertMutationBudget(ctx.userId)
    await deleteNotification(ctx.userId, id)
    revalidatePath('/dashboard')
    revalidatePath('/overview')
    revalidatePath('/notifications')
    return null
  })
}
