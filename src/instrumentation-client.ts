// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // DSN via env (não hardcoded) — inlined no build por ser NEXT_PUBLIC_*.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Replay mantém os defaults de máscara (maskAllText/blockAllMedia) — nenhum
  // texto de paciente sai na gravação.
  integrations: [Sentry.replayIntegration()],

  // 10% das transações (cota do plano gratuito; decisão 1.3).
  tracesSampleRate: 0.1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // LGPD: sem PII em telemetria de erro (decisão 1.3 do plano de correções).
  sendDefaultPii: false,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
