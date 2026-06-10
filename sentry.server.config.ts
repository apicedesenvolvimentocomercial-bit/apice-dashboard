// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // DSN via env (não hardcoded): permite desligar por ambiente e rotacionar sem
  // commit. `undefined` desabilita o SDK silenciosamente (ex.: dev sem Sentry).
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 10% das transações: suficiente p/ p95 de latência sem estourar a cota do
  // plano gratuito (decisão 1.3 do plano de correções).
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // LGPD (decisão 1.3): NÃO enviar PII por padrão — o sistema opera dados de
  // pacientes (contexto de saúde, Art. 11). IP/cookies/headers ficam fora dos
  // eventos; o stack trace continua íntegro para debug.
  sendDefaultPii: false,
})
