'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { combineCalendarDateTime } from '@/lib/calendar-time'
import { getClinicContext } from '@/server/auth/clinic-context'
import { assertCan } from '@/server/auth/assert-can'
import { fail, NotFoundError, runAction } from '@/types/errors'

import {
  createClinicCalendarEvent,
  findClinicCalendarEventById,
  softDeleteClinicCalendarEvent,
  updateClinicCalendarEvent,
} from './calendar-event-repository'

/**
 * Server actions de Calendário do DOMÍNIO CLÍNICA (Fase 4). Escopo `clientId`
 * via `getClinicContext` + repo de clínica (eventos gravam clientId). Calendário
 * continua por usuário (ctx.userId), mas isolado por clínica. Zero
 * compartilhamento com a action admin.
 */

const HEX = /^#[0-9a-fA-F]{6}$/

const createSchema = z.object({
  title: z.string().min(1, 'Título obrigatório'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  notes: z.string().optional(),
  color: z.string().regex(HEX, 'Cor inválida').optional(),
  category: z.string().max(40).optional(),
})

const updateSchema = createSchema.partial()

export async function createClinicCalendarEventAction(input: unknown) {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'write')

    const start = combineCalendarDateTime(parsed.data.startDate, parsed.data.startTime ?? null)
    if (!start) return fail('Data inicial inválida')

    let end: Date | null = null
    if (parsed.data.endDate) {
      end = combineCalendarDateTime(parsed.data.endDate, parsed.data.endTime ?? null)
    } else if (parsed.data.endTime) {
      end = combineCalendarDateTime(parsed.data.startDate, parsed.data.endTime)
    }

    const event = await createClinicCalendarEvent(ctx, {
      userId: ctx.userId,
      title: parsed.data.title,
      startAt: start,
      endAt: end,
      notes: parsed.data.notes,
      color: parsed.data.color,
      category: parsed.data.category,
    })

    revalidatePath('/agenda')
    return { id: event.id }
  })
}

export async function updateClinicCalendarEventAction(eventId: string, input: unknown) {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail('Dados inválidos')

  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'write')

    const existing = await findClinicCalendarEventById(ctx, eventId)
    if (!existing) throw new NotFoundError('Evento')

    let startAt: Date | undefined
    if (parsed.data.startDate) {
      startAt =
        combineCalendarDateTime(parsed.data.startDate, parsed.data.startTime ?? null) ?? undefined
    }

    let endAt: Date | null | undefined = undefined
    if (parsed.data.endDate || parsed.data.endTime) {
      const dateStr = parsed.data.endDate ?? parsed.data.startDate
      if (dateStr) {
        endAt = combineCalendarDateTime(dateStr, parsed.data.endTime ?? null)
      }
    }

    await updateClinicCalendarEvent(ctx, eventId, {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(startAt !== undefined ? { startAt } : {}),
      ...(endAt !== undefined ? { endAt } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
    })

    revalidatePath('/agenda')
    return null
  })
}

export async function deleteClinicCalendarEventAction(eventId: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'delete')

    const result = await softDeleteClinicCalendarEvent(ctx, eventId)
    if (result.count === 0) throw new NotFoundError('Evento')

    revalidatePath('/agenda')
    return null
  })
}
