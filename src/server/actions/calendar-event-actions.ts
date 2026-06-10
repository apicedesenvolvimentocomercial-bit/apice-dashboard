'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { fail, NotFoundError, runAction, validationFail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { getTenantContext } from '@/server/tenant/context'
import {
  createCalendarEvent,
  findCalendarEventById,
  softDeleteCalendarEvent,
  updateCalendarEvent,
} from '@/server/repositories/calendar-event-repository'
import { combineCalendarDateTime } from '@/lib/calendar-time'

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

function revalidate() {
  revalidatePath('/calendar')
}

export async function createCalendarEventAction(input: unknown) {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return validationFail(parsed.error)

  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'activities', 'write')

    const start = combineCalendarDateTime(parsed.data.startDate, parsed.data.startTime ?? null)
    if (!start) return fail('Data inicial inválida')

    let end: Date | null = null
    if (parsed.data.endDate) {
      end = combineCalendarDateTime(parsed.data.endDate, parsed.data.endTime ?? null)
    } else if (parsed.data.endTime) {
      // Mesmo dia que startDate quando só foi passado endTime.
      end = combineCalendarDateTime(parsed.data.startDate, parsed.data.endTime)
    }

    const event = await createCalendarEvent(ctx, {
      userId: ctx.userId,
      title: parsed.data.title,
      startAt: start,
      endAt: end,
      notes: parsed.data.notes,
      color: parsed.data.color,
      category: parsed.data.category,
    })

    revalidate()
    return { id: event.id }
  })
}

export async function updateCalendarEventAction(eventId: string, input: unknown) {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return validationFail(parsed.error)

  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'activities', 'write')

    const existing = await findCalendarEventById(ctx, eventId, ctx.userId)
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

    await updateCalendarEvent(ctx, eventId, ctx.userId, {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(startAt !== undefined ? { startAt } : {}),
      ...(endAt !== undefined ? { endAt } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
    })

    revalidate()
    return null
  })
}

export async function deleteCalendarEventAction(eventId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'activities', 'delete')

    const result = await softDeleteCalendarEvent(ctx, eventId, ctx.userId)
    if (result.count === 0) throw new NotFoundError('Evento')

    revalidate()
    return null
  })
}
