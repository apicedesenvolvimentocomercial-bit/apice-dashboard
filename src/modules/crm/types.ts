import type { LeadSource, PipelineCategory, StageNativeKey } from '@prisma/client'

// Funil destino p/ o dialog "Mover para funil" (lightweight: sem etapas/leads).
export type PipelineMoveTarget = {
  id: string
  name: string
  category: PipelineCategory
}

export const PIPELINE_CATEGORY_LABELS: Record<PipelineCategory, string> = {
  LEAD: 'Lead',
  PATIENT: 'Paciente',
  OTHER: 'Outro',
}

export type KanbanLead = {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: LeadSource
  procedureInterest: string | null
  tags: string[]
  createdAt: Date
  stageId: string
  position: number
  /** Agendamento ligado (Fase 2). Se preenchido, mover p/ Agendado é reagendar
   *  (retrocesso), não criar um novo. */
  appointmentId: string | null
  /** Paciente ligado (retenção). `nextReturnDueAt` = retorno esperado (reforma da
   *  retenção). Null fora da retenção / sem paciente. `id` abre o card unificado
   *  de paciente ao clicar num card de retenção. */
  patient: { id: string; nextReturnDueAt: Date | null } | null
}

export type KanbanStage = {
  id: string
  name: string
  color: string | null
  isWon: boolean
  isLost: boolean
  isNative: boolean
  nativeKey: StageNativeKey | null
  order: number
  /** 1ª página de cards (M1 — o SSR limita a KANBAN_CARDS_PAGE por coluna). */
  leads: KanbanLead[]
  /** Total REAL da coluna no banco — badge "N de M" + decide o "carregar mais". */
  totalLeads: number
}

export const SOURCE_LABELS: Record<LeadSource, string> = {
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google Ads',
  ORGANIC: 'Orgânico',
  REFERRAL: 'Indicação',
  WHATSAPP: 'WhatsApp',
  WALK_IN: 'Presencial',
  OTHER: 'Outro',
}

export const INTERACTION_LABELS: Record<string, string> = {
  CALL: 'Ligação',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  NOTE: 'Nota',
  MEETING: 'Reunião',
  WON: 'Ganho',
  LOST: 'Cancelado',
}
