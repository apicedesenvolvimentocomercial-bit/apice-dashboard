type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogPayload = Record<string, unknown>

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/**
 * Nível mínimo de log, controlado por LOG_LEVEL (debug < info < warn < error).
 * Default: `debug` em desenvolvimento, `info` fora — produção SEMPRE emite os
 * resumos de jobs/cron (decisão 1.3 do plano de correções; antes `info` era
 * mudo em prod e os crons rodavam às cegas). Valor inválido cai no default.
 * Lido a cada chamada (barato) para permitir override por ambiente sem rebuild.
 */
function minLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info'
}

function log(level: LogLevel, message: string, meta?: LogPayload) {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  }

  if (level === 'error') {
    console.error(JSON.stringify(entry))
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry))
  } else {
    // eslint-disable-next-line no-console -- saída estruturada intencional (JSON p/ log drain)
    console.log(JSON.stringify(entry))
  }
}

export const logger = {
  info: (message: string, meta?: LogPayload) => log('info', message, meta),
  warn: (message: string, meta?: LogPayload) => log('warn', message, meta),
  error: (message: string, meta?: LogPayload) => log('error', message, meta),
  debug: (message: string, meta?: LogPayload) => log('debug', message, meta),
}
