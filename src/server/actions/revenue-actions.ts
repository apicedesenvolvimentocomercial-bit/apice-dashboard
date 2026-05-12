'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseLocalDate } from '@/lib/date'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { ok, fail } from '@/types/errors'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import {
  createRevenue,
  createRevenuesBulk,
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
  await assertClientAccess(ctx, clientId)
  const parsed = revenueSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const date = parseLocalDate(parsed.data.date)
  if (!date) return fail('Data inválida')

  await createRevenue(ctx, clientId, {
    ...parsed.data,
    date,
    patientId: parsed.data.patientId || undefined,
    procedureId: parsed.data.procedureId || undefined,
  })
  revalidate(clientId)
  return ok(null)
}

export async function updateRevenueAction(revenueId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  const parsed = revenueSchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  let date: Date | undefined
  if (parsed.data.date) {
    const parsedDate = parseLocalDate(parsed.data.date)
    if (!parsedDate) return fail('Data inválida')
    date = parsedDate
  }

  await updateRevenue(ctx, revenueId, {
    ...parsed.data,
    date,
  })
  revalidate(clientId)
  return ok(null)
}

export async function deleteRevenueAction(revenueId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await softDeleteRevenue(ctx, revenueId)
  revalidate(clientId)
  return ok(null)
}

const importRowSchema = z.object({
  amountRaw: z.string(),
  dateRaw: z.string(),
  description: z.string().optional(),
  paymentMethod: z.string().optional(),
  installmentsRaw: z.string().optional(),
  procedureName: z.string().optional(),
})

const importPayloadSchema = z.array(importRowSchema).min(1).max(1000)

function parseAmount(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseInstallments(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = parseInt(raw.trim(), 10)
  if (!Number.isFinite(n) || n < 1 || n > 36) return undefined
  return n
}

const VALID_PAYMENT_METHODS = new Set([
  'CASH',
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'BANK_TRANSFER',
  'OTHER',
])

const PAYMENT_METHOD_ALIASES: Record<string, string> = {
  DINHEIRO: 'CASH',
  CASH: 'CASH',
  PIX: 'PIX',
  CARTAO_CREDITO: 'CREDIT_CARD',
  CARTAO_DE_CREDITO: 'CREDIT_CARD',
  CREDITO: 'CREDIT_CARD',
  CREDIT_CARD: 'CREDIT_CARD',
  CARTAO_DEBITO: 'DEBIT_CARD',
  CARTAO_DE_DEBITO: 'DEBIT_CARD',
  DEBITO: 'DEBIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  TRANSFERENCIA: 'BANK_TRANSFER',
  BANK_TRANSFER: 'BANK_TRANSFER',
  OUTRO: 'OTHER',
  OTHER: 'OTHER',
}

function normalizePaymentMethod(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const upper = raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
  const aliased = PAYMENT_METHOD_ALIASES[upper]
  if (aliased) return aliased
  if (VALID_PAYMENT_METHODS.has(upper)) return upper
  return undefined
}

export async function importRevenuesAction(
  clientId: string,
  rows: {
    amountRaw: string
    dateRaw: string
    description?: string
    paymentMethod?: string
    installmentsRaw?: string
    procedureName?: string
  }[]
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)

  const parsed = importPayloadSchema.safeParse(rows)
  if (!parsed.success) return fail('Payload inválido para import')

  // Resolve procedimentos por nome (case-insensitive) numa única query.
  const procedureNames = Array.from(
    new Set(
      parsed.data
        .map((r) => r.procedureName?.trim().toLowerCase())
        .filter((v): v is string => Boolean(v && v.length > 0))
    )
  )
  const procMap = new Map<string, string>()
  if (procedureNames.length > 0) {
    const procs = await prisma.procedure.findMany({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        name: { in: procedureNames, mode: 'insensitive' },
      },
      select: { id: true, name: true },
    })
    for (const p of procs) procMap.set(p.name.toLowerCase(), p.id)
  }

  const valid: {
    amount: number
    date: Date
    description?: string
    paymentMethod?: string
    installments?: number
    procedureId?: string
  }[] = []
  let skipped = 0

  for (const row of parsed.data) {
    const amount = parseAmount(row.amountRaw)
    const date = parseLocalDate(row.dateRaw)
    if (!amount || !date) {
      skipped++
      continue
    }
    valid.push({
      amount,
      date,
      description: row.description?.trim() || undefined,
      paymentMethod: normalizePaymentMethod(row.paymentMethod),
      installments: parseInstallments(row.installmentsRaw),
      procedureId: row.procedureName
        ? procMap.get(row.procedureName.trim().toLowerCase())
        : undefined,
    })
  }

  let imported = 0
  if (valid.length > 0) {
    const result = await createRevenuesBulk(ctx, clientId, valid)
    imported = result.count
  }

  revalidate(clientId)
  logger.info('Revenues imported via CSV', { clientId, imported, skipped })
  return ok({ imported, skipped })
}
