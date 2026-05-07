import type { LeadSource } from '@prisma/client'

export type KanbanLead = {
  id: string
  name: string
  phone: string | null
  source: LeadSource
  procedureInterest: string | null
  tags: string[]
  createdAt: Date
  stageId: string
}

export type KanbanStage = {
  id: string
  name: string
  color: string | null
  isWon: boolean
  isLost: boolean
  order: number
  leads: KanbanLead[]
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
  LOST: 'Perdido',
}
