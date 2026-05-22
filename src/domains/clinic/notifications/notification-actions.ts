'use server'

import { revalidatePath } from 'next/cache'

import { getClinicContext } from '@/server/auth/clinic-context'
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
 */

export async function markClinicNotificationReadAction(notificationId: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await markClinicNotificationRead(ctx, notificationId)
    revalidatePath('/overview')
    revalidatePath('/notificacoes')
    return null
  })
}

export async function markAllClinicNotificationsReadAction() {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await markAllClinicNotificationsRead(ctx)
    revalidatePath('/overview')
    revalidatePath('/notificacoes')
    return null
  })
}

export async function deleteClinicNotificationAction(notificationId: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await deleteClinicNotification(ctx, notificationId)
    revalidatePath('/overview')
    revalidatePath('/notificacoes')
    return null
  })
}
