// APP_NAME/APP_URL têm defaults seguros — não justifica forçar `env` aqui
// (e o import pulava a validação em ambientes de teste sem .env).
// As variáveis críticas (CRON_SECRET, DATABASE_URL, NEXTAUTH_SECRET, etc.)
// continuam validadas via env.ts nos lugares que dependem delas de verdade.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Senno'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const LOCALE = 'pt-BR'
export const TIMEZONE = 'America/Sao_Paulo'
export const CURRENCY = 'BRL'

export const INVITATION_EXPIRY_DAYS = 7

export const HEALTH_SCORE_THRESHOLDS = {
  CRITICAL: 40,
  WARNING: 60,
  GOOD: 80,
} as const

export const NO_SHOW_CRITICAL_THRESHOLD = 0.25
export const CONVERSION_WARNING_THRESHOLD = 0.1
export const MARGIN_WARNING_THRESHOLD = 0.2
export const SLOW_FIRST_CONTACT_MIN = 60
export const PROCEDURE_CONCENTRATION_THRESHOLD = 0.6
export const REVENUE_DROP_THRESHOLD = 0.2
export const INACTIVE_PATIENTS_THRESHOLD = 0.2
export const HIGH_MARKETING_SPEND_THRESHOLD = 500

export const DEFAULT_PIPELINE_STAGES = [
  { name: 'Lead', order: 1, color: '#6366f1', isWon: false, isLost: false },
  { name: 'Agendado', order: 2, color: '#f59e0b', isWon: false, isLost: false },
  { name: 'Compareceu', order: 3, color: '#3b82f6', isWon: false, isLost: false },
  { name: 'Fechado', order: 4, color: '#10b981', isWon: true, isLost: false },
] as const
