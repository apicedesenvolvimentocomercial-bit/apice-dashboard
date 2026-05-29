'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'

import { ok, fail } from '@/types/errors'
import type { Result } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import {
  updateClinicSchedule,
  addClinicHoliday,
  removeClinicHoliday,
} from '@/server/repositories/clinic-schedule-repository'

const scheduleSchema = z.object({
  workdayStart: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  workdayEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  workdays: z.array(z.number().int().min(0).max(6)).min(1, 'Selecione ao menos 1 dia'),
  // Janela de cancelamento → no-show. null/omisso = regra do mesmo dia.
  noShowWindowHours: z.number().int().min(0).max(8760).nullable().optional(),
})

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  name: z.string().min(1, 'Nome obrigatório').max(100),
})

function revalidate(clientId: string) {
  revalidatePath('/appointments')
  revalidatePath(`/clients/${clientId}/appointments`)
}

export async function updateClinicScheduleAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'appointments', 'write')

  const parsed = scheduleSchema.safeParse(formData)
  if (!parsed.success) return fail(parsed.error.errors[0].message)

  const { workdayStart, workdayEnd } = parsed.data
  if (workdayStart >= workdayEnd) return fail('Horário de abertura deve ser antes do fechamento')

  await updateClinicSchedule(clientId, parsed.data)
  revalidate(clientId)
  return ok(null)
}

export async function addHolidayAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'appointments', 'write')

  const parsed = holidaySchema.safeParse(formData)
  if (!parsed.success) return fail(parsed.error.errors[0].message)

  await addClinicHoliday(clientId, parsed.data)
  revalidate(clientId)
  return ok(null)
}

export async function addHolidaysBulkAction(
  clientId: string,
  holidays: { date: string; name: string }[]
): Promise<Result<{ added: number }>> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'appointments', 'write')

  const valid = holidays
    .map((h) => holidaySchema.safeParse(h))
    .filter((r) => r.success)
    .map((r) => (r as { success: true; data: { date: string; name: string } }).data)

  if (valid.length === 0) return fail('Nenhum feriado válido para importar')

  let added = 0
  for (const h of valid) {
    await addClinicHoliday(clientId, h)
    added++
  }

  revalidate(clientId)
  return ok({ added })
}

export async function removeHolidayAction(
  clientId: string,
  holidayId: string
): Promise<Result<null>> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'appointments', 'write')

  await removeClinicHoliday(clientId, holidayId)
  revalidate(clientId)
  return ok(null)
}
