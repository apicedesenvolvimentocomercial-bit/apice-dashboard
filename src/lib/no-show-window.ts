import { spDayKey } from '@/lib/date'

/**
 * Decide se um card arrastado para a etapa "Cancelado" vira NO_SHOW (conta na
 * média de no-show) ou CANCELED (cancelamento comum, fora da média).
 *
 * - `windowHours == null` → regra do MESMO DIA (default): cancelar no mesmo dia
 *   do procedimento (ou depois) = NO_SHOW; antes do dia = CANCELED.
 * - `windowHours == N` → cancelar dentro de N horas antes do horário (ou depois)
 *   = NO_SHOW; mais cedo que isso = CANCELED.
 *
 * `scheduledAt` = horário do agendamento; `now` = momento do drag.
 */
export function decideCancellationStatus(
  scheduledAt: Date,
  now: Date,
  windowHours: number | null
): 'NO_SHOW' | 'CANCELED' {
  if (windowHours == null) {
    // Mesmo dia (ou depois) = no-show; estritamente antes do dia = cancelamento.
    return spDayKey(now) < spDayKey(scheduledAt) ? 'CANCELED' : 'NO_SHOW'
  }
  const hoursUntil = (scheduledAt.getTime() - now.getTime()) / 3_600_000
  return hoursUntil > windowHours ? 'CANCELED' : 'NO_SHOW'
}
