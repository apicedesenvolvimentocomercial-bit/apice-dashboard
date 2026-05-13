'use server'

import { revalidatePath } from 'next/cache'

import { runAction } from '@/types/errors'
import { getTenantContext } from '@/server/tenant/context'
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/server/repositories/notification-repository'

export async function markNotificationReadAction(notificationId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await markNotificationRead(ctx.userId, notificationId)
    revalidatePath('/dashboard')
    revalidatePath('/overview')
    return null
  })
}

export async function markAllReadAction() {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await markAllNotificationsRead(ctx.userId)
    revalidatePath('/dashboard')
    revalidatePath('/overview')
    return null
  })
}
