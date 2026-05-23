import { defineConfig, devices } from '@playwright/test'

/**
 * Config de E2E (Fase 11). Os specs em `e2e/` cobrem fluxos principais.
 *
 * IMPORTANTE (decisão D2 do ledger `prompt/fase11-progresso.md`): rodar E2E
 * exige a app no ar + um banco. Hoje `.env` aponta produção (sem dev DB), então
 * os specs autenticados ainda não rodam aqui. O smoke spec atual cobre só rotas
 * PÚBLICAS (não tocam DB). Para rodar:
 *   1. `npx playwright install` (baixa os browsers)
 *   2. subir a app contra um DB de teste (não-produção)
 *   3. `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  // Serial + 1 worker: o `next dev` compila rota sob demanda; em paralelo o
  // servidor frio estoura timeout. Serializado, cada rota compila uma vez.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Sobe a app com BUILD DE PRODUÇÃO (não dev) — sem compile sob demanda, o
  // E2E não sofre timeout de primeira-compilação sob paralelismo. O env do banco
  // (Neon) chega via `npm run test:e2e` (`dotenv -e .env.test -- playwright
  // test`): o processo do Playwright já tem DATABASE_URL=Neon e os filhos
  // (build/start) herdam — Next não sobrescreve env já setado, então o `.env`
  // de prod não vaza pro teste.
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
