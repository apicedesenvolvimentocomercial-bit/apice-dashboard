import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Testes de INTEGRAÇÃO — rodam contra o Postgres de teste (Neon, `.env.test`),
 * com o client Prisma real (incl. a extensão de RLS de `src/lib/prisma.ts`).
 *
 *   npm run test:integration   (= dotenv -e .env.test -- vitest run --config este arquivo)
 *
 * Convenções:
 * - Arquivos `src/** /*.integration.test.ts` (excluídos da suíte unitária).
 * - Execução SERIAL (um fork único): os testes compartilham o mesmo banco e
 *   usam truncate entre suítes — paralelismo causaria interferência.
 * - O helper `src/test/integration/db.ts` tem guard anti-produção (recusa URL
 *   que não pareça o banco de teste) — todo teste deve passar por ele.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globals: false,
    // Banco compartilhado → nada de paralelismo entre arquivos/testes.
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    // Neon (serverless) tem cold start + latência de WAN: testes que semeiam
    // pipeline/templates fazem dezenas de round-trips.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(
        __dirname,
        'node_modules/next/dist/compiled/server-only/empty.js'
      ),
    },
  },
})
