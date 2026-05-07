import { Resend } from 'resend'

export const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@kpiclinic.os'
