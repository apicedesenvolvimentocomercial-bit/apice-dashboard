import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

type JobTotals = { sessions: number; resetTokens: number }

/**
 * Limpeza de linhas de autenticação mortas. Sessões e tokens de reset têm
 * semântica de TTL (`expires`/`expiresAt`) mas a validação é só app-level —
 * nada apagava as linhas vencidas, que acumulavam indefinidamente. Este job
 * varre o que já não tem mais valor:
 *   • Session  → `expires < now` (sessão expirada, nunca mais usada).
 *   • PasswordResetToken → `expiresAt < now` OU `usedAt != null` (uso único:
 *     consumido ou vencido, ambos inúteis).
 *
 * Roda como cron diário. Idempotente: apagar duas vezes é no-op.
 */
export async function runSessionCleanupJob(now: Date = new Date()): Promise<JobTotals> {
  const totals: JobTotals = { sessions: 0, resetTokens: 0 }

  try {
    const sessions = await prisma.session.deleteMany({
      where: { expires: { lt: now } },
    })
    totals.sessions = sessions.count

    const resetTokens = await prisma.passwordResetToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
      },
    })
    totals.resetTokens = resetTokens.count
  } catch (err) {
    logger.error('Session cleanup job failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }

  logger.info('Session cleanup job done', { ...totals })
  return totals
}
