type LogLevel = 'info' | 'warn' | 'error' | 'debug'

type LogPayload = Record<string, unknown>

function log(level: LogLevel, message: string, meta?: LogPayload) {
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
  } else if (process.env.NODE_ENV === 'development') {
    console.log(JSON.stringify(entry))
  }
}

export const logger = {
  info: (message: string, meta?: LogPayload) => log('info', message, meta),
  warn: (message: string, meta?: LogPayload) => log('warn', message, meta),
  error: (message: string, meta?: LogPayload) => log('error', message, meta),
  debug: (message: string, meta?: LogPayload) => log('debug', message, meta),
}
