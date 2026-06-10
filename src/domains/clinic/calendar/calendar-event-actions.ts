'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { combineCalendarDateTime } from '@/lib/calendar-time'
import { getClinicContext } from '@/server/auth/clinic-context'
import { assertCan } from '@/server/auth/assert-can'
import { fail, NotFoundError, runAction, validationFail } from '@/types/errors'

import { getClinicCalendar } from './calendar-queries'
import {
  createClinicCalendarEvent,
  createClinicCalendarEventSeries,
  findClinicCalendarEventById,
  softDeleteClinicCalendarEvent,
  softDeleteClinicCalendarEventSeries,
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
  // Recorrência (item 7). none = evento avulso (default). repeatUntil = último dia
  // da série (limitado a 1 ano à frente no servidor).
  repeat: z.enum(['none', 'weekly', 'monthly']).optional(),
  repeatUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

const updateSchema = createSchema.partial()

const MAX_OCCURRENCES = 366

/** Gera as datas (YYYY-MM-DD) da série, limitada a 1 ano à frente. */
function occurrenceDates(startDateStr: string, freq: 'weekly' | 'monthly', untilStr?: string) {
  const [y, m, d] = startDateStr.split('-').map(Number)
  const oneYear = Date.UTC(y + 1, m - 1, d)
  const requested = untilStr
    ? (() => {
        const [uy, um, ud] = untilStr.split('-').map(Number)
        return Date.UTC(uy, um - 1, ud)
      })()
    : oneYear
  const until = Math.min(requested, oneYear)

  const toYMD = (dt: Date) =>
    `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
      dt.getUTCDate()
    ).padStart(2, '0')}`

  const dates: string[] = []
  for (let k = 0; k < MAX_OCCURRENCES; k++) {
    let dt: Date
    if (freq === 'weekly') {
      dt = new Date(Date.UTC(y, m - 1, d + 7 * k))
    } else {
      // mensal: mesmo dia do mês, clampado ao último dia de meses curtos.
      const first = new Date(Date.UTC(y, m - 1 + k, 1))
      const lastDay = new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
      ).getUTCDate()
      dt = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay)))
    }
    if (dt.getTime() > until) break
    dates.push(toYMD(dt))
  }
  return dates
}

/**
 * Recarrega os eventos do calendário pessoal p/ um intervalo (item 7 / fix das
 * setas): ao navegar de mês, o cliente refaz o fetch da janela visível — sem
 * isso a página só trazia o mês corrente e ocorrências de outros meses sumiam.
 */
export async function getClinicCalendarRangeAction(fromISO: string, toISO: string) {
  return runAction(async () => {
    const from = new Date(fromISO)
    const to = new Date(toISO)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new NotFoundError('Intervalo')
    }
    return getClinicCalendar({ from, to })
  })
}

export async function createClinicCalendarEventAction(input: unknown) {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return validationFail(parsed.error)

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

    // Recorrência (item 7): gera N ocorrências (≤ 1 ano) dividindo um grupo. Cada
    // ocorrência usa o MESMO horário do dia; multi-dia não recorre (só same-day).
    const repeat = parsed.data.repeat ?? 'none'
    if (repeat !== 'none') {
      const dates = occurrenceDates(parsed.data.startDate, repeat, parsed.data.repeatUntil)
      if (dates.length === 0) return fail('Período de recorrência inválido')
      if (dates.length === 1) {
        // Uma só ocorrência cai no fluxo avulso (sem grupo).
        const event = await createClinicCalendarEvent(ctx, {
          userId: ctx.userId,
          title: parsed.data.title,
          startAt: start,
          endAt: end,
          notes: parsed.data.notes,
          color: parsed.data.color,
          category: parsed.data.category,
        })
        revalidatePath('/appointments')
        return { id: event.id, count: 1 }
      }

      const occurrences = dates.map((dateStr) => {
        const oStart = combineCalendarDateTime(dateStr, parsed.data.startTime ?? null) as Date
        const oEnd = parsed.data.endTime
          ? combineCalendarDateTime(dateStr, parsed.data.endTime)
          : null
        return { startAt: oStart, endAt: oEnd }
      })
      const recurrenceGroupId = crypto.randomUUID()
      await createClinicCalendarEventSeries(
        ctx,
        {
          userId: ctx.userId,
          title: parsed.data.title,
          notes: parsed.data.notes,
          color: parsed.data.color,
          category: parsed.data.category,
          recurrenceGroupId,
        },
        occurrences
      )
      revalidatePath('/appointments')
      return { recurrenceGroupId, count: occurrences.length }
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

    revalidatePath('/appointments')
    return { id: event.id, count: 1 }
  })
}

export async function updateClinicCalendarEventAction(eventId: string, input: unknown) {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return validationFail(parsed.error)

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

    revalidatePath('/appointments')
    return null
  })
}

export async function deleteClinicCalendarEventAction(
  eventId: string,
  scope: 'one' | 'series' = 'one'
) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'delete')

    // Excluir a SÉRIE inteira (item 7): resolve o grupo a partir deste evento e
    // apaga todas as ocorrências de uma vez.
    if (scope === 'series') {
      const existing = await findClinicCalendarEventById(ctx, eventId)
      if (!existing) throw new NotFoundError('Evento')
      if (existing.recurrenceGroupId) {
        const res = await softDeleteClinicCalendarEventSeries(ctx, existing.recurrenceGroupId)
        revalidatePath('/appointments')
        return { count: res.count }
      }
      // Sem grupo → cai no delete simples.
    }

    const result = await softDeleteClinicCalendarEvent(ctx, eventId)
    if (result.count === 0) throw new NotFoundError('Evento')

    revalidatePath('/appointments')
    return { count: 1 }
  })
}
