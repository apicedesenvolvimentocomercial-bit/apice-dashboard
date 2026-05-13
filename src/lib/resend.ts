import { Resend } from 'resend'

import { env } from '@/lib/env'

export const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

// EMAIL_FROM é obrigatório quando RESEND_API_KEY está setado (validado em env.ts).
// Em dev sem Resend usamos um placeholder explícito para que o logger evidencie.
export const EMAIL_FROM = env.EMAIL_FROM ?? 'no-reply@example.com'
