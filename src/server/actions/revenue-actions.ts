'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseLocalDate } from '@/lib/date'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { ok, fail, validationFail } from '@/types/errors'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import {
  cancelRevenue,
  createRevenue,
  createRevenuesBulk,
  updateRevenue,
  softDeleteRevenue,
  type RevenueProcedureInput,
} from '@/server/repositories/revenue-repository'

const REVENUE_TYPES = [
  'PROCEDIMENTO',
  'PACOTE',
  'RECORRENCIA',
  'PRODUTO',
  'OUTRA',
  'FINANCEIRA',
] as const

const revenueSchema = z.object({
  amount: z.number().max(9_999_999_999.99, 'Valor muito alto').positive('Valor deve ser positivo'),
  date: z.string().min(1, 'Data obrigatória').max(30, 'Data inválida'),
  description: z
    .string()
    .max(65535, 'Descrição muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'Descrição contém caracteres inválidos'
    )
    .optional(),
  paymentMethod: z
    .string()
    .max(255, 'Método de pagamento muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O método de pagamento contém caracteres inválidos'
    )
    .optional(),
  installments: z.number().int().max(100, 'Numero de parcelas muito grande').positive().optional(),
  patientId: z.string().max(64).optional(),
  procedureIds: z.array(z.string().max(64)).max(100, 'Muitos procedimentos').optional(),
  discountPct: z.number().min(0, 'Desconto inválido').max(100, 'Desconto máximo 100%').optional(),
  type: z.enum(REVENUE_TYPES).optional(),
})

// Bruto/desconto/tipo p/ competência. Com procedimentos: bruto = soma dos preços,
// líquido = bruto − desconto%. Sem: o valor informado é o bruto (sem desconto).
function deriveGrossDiscountType(
  procedures: RevenueProcedureInput[],
  informedAmount: number,
  discountPct: number | undefined,
  netAmount: number,
  type: (typeof REVENUE_TYPES)[number] | undefined
) {
  const grossAmount =
    procedures.length > 0 ? procedures.reduce((s, p) => s + p.price, 0) : informedAmount
  const discount = Math.max(0, Math.round((grossAmount - netAmount) * 100) / 100)
  const resolvedType = type ?? (procedures.length > 0 ? 'PROCEDIMENTO' : 'OUTRA')
  return { grossAmount, discount, type: resolvedType as (typeof REVENUE_TYPES)[number] }
}

function revalidate(clientId: string) {
  revalidatePath('/financial')
  revalidatePath(`/clients/${clientId}/financial`)
}

// Busca preços/custos atuais dos procedimentos no servidor (não confia no client).
// Preserva ordem e duplicatas do input (ex.: 2x o mesmo procedimento).
async function resolveProcedures(
  organizationId: string,
  clientId: string,
  ids: string[]
): Promise<RevenueProcedureInput[]> {
  if (ids.length === 0) return []
  const uniqueIds = Array.from(new Set(ids))
  const procs = await prisma.procedure.findMany({
    where: { organizationId, clientId, id: { in: uniqueIds }, deletedAt: null },
    select: { id: true, name: true, price: true, cost: true },
  })
  const map = new Map(procs.map((p) => [p.id, p]))
  return ids
    .map((id) => map.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      procedureId: p.id,
      name: p.name,
      price: Number(p.price),
      cost: Number(p.cost),
    }))
}

// Valor final = soma dos preços × (1 − desconto%), arredondado a 2 casas.
function computeAmount(
  procedures: RevenueProcedureInput[],
  discountPct: number | undefined
): number {
  const sum = procedures.reduce((s, p) => s + p.price, 0)
  const factor = 1 - (discountPct ?? 0) / 100
  return Math.round(sum * factor * 100) / 100
}

export async function createRevenueAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta action
  await assertCan(ctx, 'financial', 'write')
  const parsed = revenueSchema.safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  const date = parseLocalDate(parsed.data.date)
  if (!date) return fail('Data inválida')

  const procedures = await resolveProcedures(
    ctx.organizationId,
    clientId,
    parsed.data.procedureIds ?? []
  )
  // Com procedimentos, o valor é derivado da soma (− desconto). Sem, usa o informado.
  const amount =
    procedures.length > 0 ? computeAmount(procedures, parsed.data.discountPct) : parsed.data.amount
  if (!(amount > 0)) return fail('Valor deve ser positivo')

  const { grossAmount, discount, type } = deriveGrossDiscountType(
    procedures,
    parsed.data.amount,
    parsed.data.discountPct,
    amount,
    parsed.data.type
  )

  const revenue = await createRevenue(ctx, clientId, {
    grossAmount,
    discount,
    amount,
    type,
    date,
    description: parsed.data.description || undefined,
    paymentMethod: parsed.data.paymentMethod || undefined,
    installments: parsed.data.installments,
    patientId: parsed.data.patientId || undefined,
    procedures,
  })
  createAuditLog(ctx, {
    action: 'create',
    entityType: 'Revenue',
    entityId: revenue.id,
    changes: { amount, date: parsed.data.date },
  }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}

export async function updateRevenueAction(revenueId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'write')
  const parsed = revenueSchema.partial().safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  let date: Date | undefined
  if (parsed.data.date) {
    const parsedDate = parseLocalDate(parsed.data.date)
    if (!parsedDate) return fail('Data inválida')
    date = parsedDate
  }

  // Se procedimentos vieram no payload, re-sincroniza itens + custos e deriva o valor.
  const hasProcedures = parsed.data.procedureIds !== undefined
  const procedures = hasProcedures
    ? await resolveProcedures(ctx.organizationId, clientId, parsed.data.procedureIds ?? [])
    : undefined
  const amount =
    procedures && procedures.length > 0
      ? computeAmount(procedures, parsed.data.discountPct)
      : parsed.data.amount

  // Quando o valor é (re)calculável, recomputa bruto/desconto/tipo. Senão, deixa
  // os campos de fora (update parcial). NOTA: não regenera parcelas (ver repo).
  const moneyFields =
    amount !== undefined && amount > 0
      ? deriveGrossDiscountType(
          procedures ?? [],
          parsed.data.amount ?? amount,
          parsed.data.discountPct,
          amount,
          parsed.data.type
        )
      : undefined

  await updateRevenue(
    ctx,
    revenueId,
    clientId,
    {
      ...(amount !== undefined ? { amount } : {}),
      ...(moneyFields
        ? {
            grossAmount: moneyFields.grossAmount,
            discount: moneyFields.discount,
            type: moneyFields.type,
          }
        : {}),
      date,
      description: parsed.data.description,
      paymentMethod: parsed.data.paymentMethod,
      installments: parsed.data.installments,
      patientId: parsed.data.patientId,
    },
    procedures
  )
  revalidate(clientId)
  return ok(null)
}

export async function cancelRevenueAction(revenueId: string, clientId: string, reason?: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'write')
  const res = await cancelRevenue(ctx, revenueId, clientId, reason?.trim() || undefined)
  if (res.count === 0) return fail('Receita não encontrada')
  createAuditLog(ctx, {
    action: 'update',
    entityType: 'Revenue',
    entityId: revenueId,
    changes: { status: 'CANCELADA' },
  }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}

export async function deleteRevenueAction(revenueId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'delete')
  await softDeleteRevenue(ctx, revenueId, clientId)
  createAuditLog(ctx, { action: 'delete', entityType: 'Revenue', entityId: revenueId }).catch(
    () => {}
  )
  revalidate(clientId)
  return ok(null)
}

const importRowSchema = z.object({
  amountRaw: z.string().max(50, 'Valor muito grande'),
  dateRaw: z.string().max(50, 'Data muito grande'),
  description: z.string().max(65535, 'Descrição muito grande').optional(),
  paymentMethod: z.string().max(100, 'Método de pagamento muito grande').optional(),
  installmentsRaw: z.string().max(10, 'Parcelas inválidas').optional(),
  procedureName: z.string().max(255, 'Nome de procedimento muito grande').optional(),
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
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'write')

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
