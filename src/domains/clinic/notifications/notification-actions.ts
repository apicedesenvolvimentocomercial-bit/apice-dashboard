'use server'

import { revalidatePath } from 'next/cache'

import { getClinicContext } from '@/server/auth/clinic-context'
import { assertMutationBudget } from '@/server/security/mutation-throttle'
import { runAction } from '@/types/errors'

import {
  deleteClinicNotification,
  markAllClinicNotificationsRead,
  markClinicNotificationRead,
} from './notification-repository'

/**
 * Server actions de notificação do DOMÍNIO CLÍNICA (Fase 2). Usam
 * `getClinicContext` (escopo `clientId` garantido) e revalidam apenas rotas
 * da clínica — nunca tocam `/dashboard` (admin). Espelham o fluxo admin sem
 * compartilhar action (§2: zero lógica de feature compartilhada).
 *
 * Não passam por assertCan (avisos do PRÓPRIO usuário) → o rate-limit
 * anti-DoS de mutação entra explícito em cada uma.
 */

export async function markClinicNotificationReadAction(notificationId: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertMutationBudget(ctx.userId)
    await markClinicNotificationRead(ctx, notificationId)
    revalidatePath('/overview')
    revalidatePath('/notificacoes')
    return null
  })
}

export async function markAllClinicNotificationsReadAction() {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertMutationBudget(ctx.userId)
    await markAllClinicNotificationsRead(ctx)
    revalidatePath('/overview')
    revalidatePath('/notificacoes')
    return null
  })
}

export async function deleteClinicNotificationAction(notificationId: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertMutationBudget(ctx.userId)
    await deleteClinicNotification(ctx, notificationId)
    revalidatePath('/overview')
    revalidatePath('/notificacoes')
    return null
  })
}
