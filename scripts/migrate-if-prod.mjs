/**
 * Decisão C1 do plano de correções: `prisma migrate deploy` roda como parte do
 * build de PRODUÇÃO na Vercel — a migration acompanha o deploy, nunca fica para
 * trás (antes era aplicada à mão).
 *
 * Só em `VERCEL_ENV === 'production'`:
 * - builds de preview e CI NÃO migram (apontariam para o banco errado ou
 *   migrariam prod a partir de branch não revisada);
 * - build local (`npm run build`) também não migra.
 *
 * Usa o `DIRECT_URL` (conexão de dono, sem pooler) via datasource `directUrl`
 * do schema — comportamento padrão do `migrate deploy`. Se a migration falhar,
 * o build falha — que é o comportamento desejado (deploy não sobe meio-migrado).
 */
import { execSync } from 'node:child_process'

if (process.env.VERCEL_ENV === 'production') {
  console.log('[build] VERCEL_ENV=production → prisma migrate deploy')
  execSync('npx prisma migrate deploy', { stdio: 'inherit' })
} else {
  console.log(
    `[build] VERCEL_ENV=${process.env.VERCEL_ENV ?? '(unset)'} → pulando prisma migrate deploy`
  )
}
