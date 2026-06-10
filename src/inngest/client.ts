import { Inngest } from 'inngest'

/**
 * Client do Inngest (decisão Q1 do plano de correções) — scheduler + fila do
 * sistema. Substitui os crons do vercel.json (o plano Hobby limita a 2 crons
 * diários imprecisos; aqui são 8 agendamentos + fan-out + retry).
 *
 * Envs (produção): INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY (o SDK lê do
 * process.env sozinho). Em dev: `npx inngest-cli dev` descobre a rota
 * /api/inngest automaticamente, sem chaves.
 */
export const inngest = new Inngest({ id: 'senno' })
