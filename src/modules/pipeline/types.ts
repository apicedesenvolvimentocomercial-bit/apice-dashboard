import type { DealStage } from '@prisma/client'

export type PipelineDealView = {
  id: string
  stage: DealStage
  value: number | null
  probability: number | null
  expectedCloseAt: Date | null
  wonAt: Date | null
  lostAt: Date | null
  lostReason: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  client: {
    id: string
    name: string
    status: string
    city: string | null
    state: string | null
  }
}

export type PipelineColumn = {
  stage: DealStage
  label: string
  color: string
  deals: PipelineDealView[]
}

export const STAGE_ORDER: DealStage[] = [
  'PROSPECT',
  'CONTACTED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
]

export const STAGE_LABELS: Record<DealStage, string> = {
  PROSPECT: 'Prospect',
  CONTACTED: 'Contatado',
  PROPOSAL_SENT: 'Proposta enviada',
  NEGOTIATION: 'Negociação',
  WON: 'Ganho',
  LOST: 'Perdido',
}

export const STAGE_COLORS: Record<DealStage, string> = {
  PROSPECT: '#94a3b8',
  CONTACTED: '#60a5fa',
  PROPOSAL_SENT: '#a855f7',
  NEGOTIATION: '#f59e0b',
  WON: '#22c55e',
  LOST: '#ef4444',
}

export function columnsFromDeals(deals: PipelineDealView[]): PipelineColumn[] {
  return STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    color: STAGE_COLORS[stage],
    deals: deals.filter((d) => d.stage === stage),
  }))
}
