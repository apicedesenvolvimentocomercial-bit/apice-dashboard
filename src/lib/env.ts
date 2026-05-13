import { z } from 'zod'

/**
 * Helper que trata strings vazias do `.env` como ausência (`undefined`).
 * Necessário porque o convencional `.string().url().optional()` rejeita "".
 */
const optionalString = () =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional()
  )
const optionalUrl = (label: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url(`${label} must be a valid URL`).optional()
  )
const optionalEmail = (label: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email(`${label} must be a valid email address`).optional()
  )

const envSchema = z
  .object({
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
    DIRECT_URL: z.string().url('DIRECT_URL must be a valid URL'),

    // Supabase (opcional — usado apenas se não for Prisma Postgres)
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl('NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString(),
    SUPABASE_SERVICE_ROLE_KEY: optionalString(),

    NEXTAUTH_URL: z
      .string()
      .url('NEXTAUTH_URL must be a valid URL')
      .default('http://localhost:3000'),
    NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),

    RESEND_API_KEY: optionalString(),
    EMAIL_FROM: optionalEmail('EMAIL_FROM'),

    CRON_SECRET: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().min(16, 'CRON_SECRET must be at least 16 characters').optional()
    ),

    NEXT_PUBLIC_SENTRY_DSN: optionalUrl('NEXT_PUBLIC_SENTRY_DSN'),

    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    NEXT_PUBLIC_APP_NAME: z.string().default('KPI Clinic OS'),

    WHATSAPP_API_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default('false'),
    META_ADS_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default('false'),
    GOOGLE_ADS_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default('false'),

    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .refine(
    (e) => !(e.RESEND_API_KEY && !e.EMAIL_FROM),
    'EMAIL_FROM is required when RESEND_API_KEY is set'
  )

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables')
}

export const env = _env.data
