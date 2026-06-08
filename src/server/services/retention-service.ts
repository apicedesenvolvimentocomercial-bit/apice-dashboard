import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

/**
 * Regras de membresia da pipeline de RETENÇÃO (itens 6/7).
 *
 * Modelo: um cliente "vira paciente" ao FECHAR (procedimento + baixa). O card
 * fica em Fechado o resto do dia e, no dia seguinte, o cron de retenção migra o
 * MESMO card para Retenção/Ativo (ver retention-job). Cadastro manual de paciente
 * entra em Retenção na hora (addPatientToRetention). Em ambos os casos, cards
 * duplicados do mesmo cliente em etapas comerciais ATIVAS são removidos.
 *
 * Dedup por phone/email/name (escolha do produto) — pode haver falso-positivo em
 * homônimos sem telefone/email; aceito conforme decisão.
 */

type Person = {
  name: string
  phone: string | null
  email: string | null
  patientId?: string | null
}

// Etapas nativas do ciclo de vida da retenção (reforma — retencao-reforma-progresso.md).
export type RetentionStageKey = 'POST_CARE' | 'NURTURE' | 'REACTIVATION' | 'LOYALTY' | 'WINBACK'

/** Mapa nativeKey→stageId da pipeline RETENTION da clínica (vazio se ausente). */
export async function getRetentionStageMap(
  clientId: string
): Promise<Partial<Record<RetentionStageKey, string>>> {
  const retention = await prisma.pipeline.findFirst({
    where: { clientId, kind: 'RETENTION' },
    select: { stages: { select: { id: true, nativeKey: true } } },
  })
  const map: Partial<Record<RetentionStageKey, string>> = {}
  for (const s of retention?.stages ?? []) {
    if (s.nativeKey) map[s.nativeKey as RetentionStageKey] = s.id
  }
  return map
}

/**
 * Etapa de ENTRADA da pipeline RETENTION (Pós-procedimento / POST_CARE). É onde um
 * card recém-chegado pousa; o cron recalcula o bucket certo na próxima rodada.
 * (Substitui o antigo `getRetentionActiveStageId` — ACTIVE virou POST_CARE.)
 */
export async function getRetentionEntryStageId(clientId: string): Promise<string | null> {
  const map = await getRetentionStageMap(clientId)
  return map.POST_CARE ?? map.NURTURE ?? null
}

/**
 * `where` dos cards comerciais ATIVOS (ainda prospectando: não won/lost) do mesmo
 * cliente — para remover duplicatas ao entrar em retenção. Casa por patientId OU
 * telefone OU email OU nome (case-insensitive). `excludeLeadId` evita apagar o
 * próprio card que está migrando.
 */
export function activeCommercialDuplicatesWhere(
  clientId: string,
  organizationId: string,
  person: Person,
  excludeLeadId?: string
): Prisma.LeadWhereInput {
  const or: Prisma.LeadWhereInput[] = [{ name: { equals: person.name, mode: 'insensitive' } }]
  if (person.patientId) or.push({ patientId: person.patientId })
  if (person.phone) or.push({ phone: person.phone })
  if (person.email) or.push({ email: { equals: person.email, mode: 'insensitive' } })

  return {
    clientId,
    organizationId,
    deletedAt: null,
    ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
    // Etapa comercial ainda em prospecção (não Fechado/Cancelado).
    stage: { pipeline: { kind: 'COMMERCIAL' }, isWon: false, isLost: false },
    OR: or,
  }
}

/** Soft-delete dos cards comerciais ativos duplicados do cliente. */
export async function removeActiveCommercialDuplicates(
  clientId: string,
  organizationId: string,
  person: Person,
  excludeLeadId?: string
): Promise<number> {
  const res = await prisma.lead.updateMany({
    where: activeCommercialDuplicatesWhere(clientId, organizationId, person, excludeLeadId),
    data: { deletedAt: new Date() },
  })
  return res.count
}

/**
 * Entra um paciente na pipeline de Retenção AGORA (cadastro manual). Idempotente:
 * não duplica se já houver card de retenção. Remove duplicatas comerciais ativas.
 * Chamado sob `enterClientScope(clientId)` (RLS ok — Lead tem clientId no where).
 */
export async function addPatientToRetention(
  clientId: string,
  organizationId: string,
  patientId: string
): Promise<void> {
  const entryStageId = await getRetentionEntryStageId(clientId)
  if (!entryStageId) return

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clientId, organizationId, deletedAt: null },
    select: { id: true, name: true, phone: true, email: true },
  })
  if (!patient) return

  // Remove cards comerciais ativos do mesmo cliente (evita prospect + cliente).
  await removeActiveCommercialDuplicates(clientId, organizationId, patient)

  // Garante UM card de retenção (não duplica).
  const existing = await prisma.lead.findFirst({
    where: {
      clientId,
      patientId,
      deletedAt: null,
      stage: { pipeline: { kind: 'RETENTION' } },
    },
    select: { id: true },
  })
  if (existing) return

  await prisma.lead.create({
    data: {
      organizationId,
      clientId,
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      source: 'WALK_IN',
      stageId: entryStageId,
      patientId,
    },
  })
}

/**
 * feat3 — Soft-delete do(s) card(s) de RETENÇÃO de um paciente. O card de
 * retenção é espelho do paciente: ele só some quando o paciente é removido na
 * aba Pacientes (não há "remover" no card). Cards comerciais NÃO são tocados.
 * Chamado sob `enterClientScope(clientId)` (RLS ok — `clientId` no where).
 */
export async function removeRetentionCardForPatient(
  clientId: string,
  organizationId: string,
  patientId: string
): Promise<number> {
  const res = await prisma.lead.updateMany({
    where: {
      clientId,
      organizationId,
      patientId,
      deletedAt: null,
      stage: { pipeline: { kind: 'RETENTION' } },
    },
    data: { deletedAt: new Date() },
  })
  return res.count
}
