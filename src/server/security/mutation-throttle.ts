import 'server-only'

import { logger } from '@/lib/logger'
import { TooManyRequestsError } from '@/types/errors'

import { consumeRateLimit } from './rate-limit'

/**
 * Rate-limit de MUTAÇÕES autenticadas (anti-DoS, complemento dos tetos de
 * tamanho): o `bodySizeLimit` + `.max()` do zod limitam UM request, mas nada
 * impedia um usuário autenticado de scriptar MILHARES de requests pequenos
 * (curl + cookie de sessão) e afogar a fila de conexões do Postgres com
 * inserts/updates. Aqui cada usuário tem um ORÇAMENTO de escrita em duas
 * janelas: rajada (por minuto) e sustentada (por hora).
 *
 * Enforcement no CHOKEPOINT: `assertCan` consome o orçamento em toda ação
 * `write`/`delete`/`assignToOthers` — actions atuais e futuras herdam o teto
 * sem código extra (mesma filosofia do broadcast-guard). Mutações que não
 * passam por `assertCan` (cargos, titularidade, notificações, preferências)
 * chamam `assertMutationBudget` explicitamente.
 *
 * Dimensionamento: um humano intenso gera ~1–2 writes/s em rajadas curtas, e
 * algumas actions consomem 2 hits (asserts de 2 módulos, ex.: comparecimento =
 * appointments+patients). 120/min é inalcançável à mão e trivial de estourar
 * por script; 2000/h barra o flood "devagar e sempre". Leituras (read/viewAll)
 * ficam FORA — SSR, busca com debounce e filtros não podem ser bloqueados.
 *
 * FAIL-OPEN: limiter indisponível não derruba a operação (se o Postgres do
 * limiter caiu, a mutação cairia sozinha — e um limiter quebrado não pode
 * parar o app inteiro). Mesma política do login/reset-throttle.
 */

const WRITE_PER_MIN = 120
const WRITE_PER_HOUR = 2000

/** Exports (CSV/XLSX/PDF): leitura PESADA + arquivo em memória por request. */
const EXPORT_PER_MIN = 15
const EXPORT_PER_HOUR = 100

/** Recálculo de insights roda o engine inteiro — teto por CLÍNICA. */
const INSIGHT_RECALC_LIMIT = 5
const INSIGHT_RECALC_WINDOW_SEC = 5 * 60

const writeMinKey = (userId: string) => `mut:min:${userId}`
const writeHourKey = (userId: string) => `mut:hr:${userId}`
const exportMinKey = (userId: string) => `export:min:${userId}`
const exportHourKey = (userId: string) => `export:hr:${userId}`
const insightRecalcKey = (clientId: string) => `insights:recalc:${clientId}`

export type BudgetResult = {
  allowed: boolean
  /** Segundos até a janela mais restritiva liberar (0 se permitido). */
  retryAfterSec: number
}

/**
 * Consome 1 hit nas DUAS janelas (rajada + sustentada) atomicamente no banco;
 * bloqueia se QUALQUER uma estourar. As janelas são consumidas juntas de
 * propósito: request bloqueado continua contando (flood não "espera de graça").
 */
async function consumeDualWindow(
  burstKey: string,
  sustainedKey: string,
  burst: { limit: number; windowSec: number },
  sustained: { limit: number; windowSec: number }
): Promise<BudgetResult> {
  const [b, s] = await Promise.all([
    consumeRateLimit(burstKey, burst),
    consumeRateLimit(sustainedKey, sustained),
  ])
  if (b.allowed && s.allowed) return { allowed: true, retryAfterSec: 0 }
  return { allowed: false, retryAfterSec: Math.max(b.retryAfterSec, s.retryAfterSec) }
}

/** Orçamento de ESCRITA por usuário (rajada 60s + sustentado 1h). */
export async function consumeMutationBudget(userId: string): Promise<BudgetResult> {
  try {
    return await consumeDualWindow(
      writeMinKey(userId),
      writeHourKey(userId),
      { limit: WRITE_PER_MIN, windowSec: 60 },
      { limit: WRITE_PER_HOUR, windowSec: 60 * 60 }
    )
  } catch (e) {
    logger.error('Mutation rate-limit indisponível (fail-open)', { error: String(e) })
    return { allowed: true, retryAfterSec: 0 }
  }
}

/** Versão assert p/ actions: lança `TooManyRequestsError` (vira 429/`fail` amigável). */
export async function assertMutationBudget(userId: string): Promise<void> {
  const r = await consumeMutationBudget(userId)
  if (!r.allowed) {
    logger.warn('Mutação bloqueada por rate-limit', { userId, retryAfterSec: r.retryAfterSec })
    throw new TooManyRequestsError(
      'Muitas operações em sequência. Aguarde alguns instantes e tente novamente.',
      r.retryAfterSec
    )
  }
}

/**
 * Orçamento de EXPORT por usuário (rotas `/api/export/**` e `/api/reports/**`).
 * Não lança: as rotas respondem 429 + `Retry-After` direto.
 */
export async function consumeExportBudget(userId: string): Promise<BudgetResult> {
  try {
    return await consumeDualWindow(
      exportMinKey(userId),
      exportHourKey(userId),
      { limit: EXPORT_PER_MIN, windowSec: 60 },
      { limit: EXPORT_PER_HOUR, windowSec: 60 * 60 }
    )
  } catch (e) {
    logger.error('Export rate-limit indisponível (fail-open)', { error: String(e) })
    return { allowed: true, retryAfterSec: 0 }
  }
}

/**
 * Teto do RECÁLCULO manual de insights, por clínica (o botão roda o engine
 * inteiro — dezenas de queries + writes). O cron diário não passa por aqui.
 */
export async function assertInsightRecalcBudget(clientId: string): Promise<void> {
  let allowed = true
  let retryAfterSec = 0
  try {
    const r = await consumeRateLimit(insightRecalcKey(clientId), {
      limit: INSIGHT_RECALC_LIMIT,
      windowSec: INSIGHT_RECALC_WINDOW_SEC,
    })
    allowed = r.allowed
    retryAfterSec = r.retryAfterSec
  } catch (e) {
    logger.error('Insight-recalc rate-limit indisponível (fail-open)', { error: String(e) })
    return
  }
  if (!allowed) {
    throw new TooManyRequestsError(
      'Os insights já foram recalculados várias vezes seguidas — aguarde alguns minutos.',
      retryAfterSec
    )
  }
}
