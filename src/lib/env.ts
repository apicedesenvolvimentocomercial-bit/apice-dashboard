import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  DIRECT_URL: z.string().url('DIRECT_URL must be a valid URL'),

  // Supabase (opcional — usado apenas se não for Prisma Postgres)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL').default('http://localhost:3000'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

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

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables')
}

export const env = _env.data
