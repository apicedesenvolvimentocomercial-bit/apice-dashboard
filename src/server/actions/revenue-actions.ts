'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ok, fail } from '@/types/errors'
import { getTenantContext } from '@/server/tenant/context'
import {
  createRevenue,
  updateRevenue,
  softDeleteRevenue,
} from '@/server/repositories/revenue-repository'

const revenueSchema = z.object({
  amount: z.number().positive('Valor deve ser positivo'),
  date: z.string().min(1, 'Data obrigatória'),
  description: z.string().optional(),
  paymentMethod: z.string().optional(),
  installments: z.number().int().positive().optional(),
  patientId: z.string().optional(),
  procedureId: z.string().optional(),
})

function revalidate(clientId: string) {
  revalidatePath('/financial')
  revalidatePath(`/clients/${clientId}/financial`)
}

export async function createRevenueAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  const parsed = revenueSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  await createRevenue(ctx, clientId, {
    ...parsed.data,
    date: new Date(parsed.data.date),
    patientId: parsed.data.patientId || undefined,
    procedureId: parsed.data.procedureId || undefined,
  })
  revalidate(clientId)
  return ok(null)
}

export async function updateRevenueAction(revenueId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  const parsed = revenueSchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  await updateRevenue(ctx, revenueId, {
    ...parsed.data,
    date: parsed.data.date ? new Date(parsed.data.date) : undefined,
  })
  revalidate(clientId)
  return ok(null)
}

export async function deleteRevenueAction(revenueId: string, clientId: string) {
  const ctx = await getTenantContext()
  await softDeleteRevenue(ctx, revenueId)
  revalidate(clientId)
  return ok(null)
}
