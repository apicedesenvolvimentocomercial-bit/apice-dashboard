export type Period = 'day' | 'week' | 'month' | 'quarter' | 'custom'

export type PeriodRange = {
  key: Period
  from: Date
  to: Date
}

export type CommercialInputs = {
  leadsCount: number
  wonCount: number
  appointmentsCount: number
  attendedCount: number
  noShowCount: number
  avgTimeToFirstContactMin: number | null
}

export type FinancialInputs = {
  revenueTotal: number
  costTotalAll: number
  costMarketing: number
  costVariable: number
  revenueCount: number
  newPatientsCount: number
  revenueAttributedToMarketing: number
}

export type HealthScoreInputs = {
  conversionRate: number | null
  noShowRate: number | null
  netMargin: number | null
  revenueGrowthMoM: number | null
  leadsTargetAchievement: number | null
  avgTimeToFirstContactMin: number | null
}

export type CommercialKpis = {
  leadsCount: number
  appointmentsCount: number
  attendedCount: number
  noShowCount: number
  conversionRate: number | null
  noShowRate: number | null
  attendanceRate: number | null
  avgTimeToFirstContactMin: number | null
}

export type FinancialKpis = {
  totalRevenue: number
  totalCosts: number
  netProfit: number
  grossMargin: number | null
  netMargin: number | null
  averageTicket: number | null
  marketingCost: number
  roi: number | null
  cac: number | null
  estimatedLostRevenue: number
}
