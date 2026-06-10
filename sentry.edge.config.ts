// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // DSN via env (não hardcoded) — ver sentry.server.config.ts.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 10% das transações (cota do plano gratuito; decisão 1.3).
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // LGPD: sem PII em telemetria de erro (decisão 1.3).
  sendDefaultPii: false,
})
