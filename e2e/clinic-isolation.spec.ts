import { expect, test, type Page } from '@playwright/test'

/**
 * Isolamento cross-tenant na UI (banco de teste Neon, seed `seed-e2e`).
 * Owner da Clínica Alpha só pode ver Paciente Alpha; o da Bravo só Paciente
 * Bravo. Complementa os 21 testes de isolamento de repositório (vitest).
 */

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  const accept = page.getByRole('dialog', { name: 'Aviso de cookies' }).getByRole('button', {
    name: 'Entendi',
  })
  if (await accept.isVisible().catch(() => false)) await accept.click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // CLIENT_OWNER cai em /overview (home da clínica).
  await expect(page).toHaveURL(/\/overview/, { timeout: 30_000 })
}

test('owner da Clínica Alpha vê só o paciente da Alpha', async ({ page }) => {
  await login(page, 'owner-a@senno.dev', 'owner123')
  await page.goto('/patients')
  await expect(page.getByText('Paciente Alpha')).toBeVisible()
  await expect(page.getByText('Paciente Bravo')).toHaveCount(0)
})

test('owner da Clínica Bravo vê só o paciente da Bravo', async ({ page }) => {
  await login(page, 'owner-b@senno.dev', 'owner123')
  await page.goto('/patients')
  await expect(page.getByText('Paciente Bravo')).toBeVisible()
  await expect(page.getByText('Paciente Alpha')).toHaveCount(0)
})

/**
 * Isolamento das ROTAS DE API que recebem `clientId` na URL. Provam que trocar
 * o id na URL (IDOR) é barrado por `assertClientAccess` — e que a rota da
 * própria clínica responde. Estas rotas também passam a fixar o escopo de RLS
 * (`enterClientScope`), tornando o isolamento defesa-em-profundidade.
 */
test('rota de export barra clínica de outro tenant (403) e libera a própria (200)', async ({
  page,
}) => {
  await login(page, 'owner-a@senno.dev', 'owner123')

  // Própria clínica → 200.
  const own = await page.request.get('/api/export/e2e-clinic-a/patients')
  expect(own.status()).toBe(200)
  const ownBody = await own.text()
  expect(ownBody).toContain('Paciente Alpha')
  expect(ownBody).not.toContain('Paciente Bravo')

  // Clínica de outro tenant (IDOR via troca de id na URL) → 403.
  const other = await page.request.get('/api/export/e2e-clinic-b/patients')
  expect(other.status()).toBe(403)
})

test('rota de relatório PDF barra clínica de outro tenant (403)', async ({ page }) => {
  await login(page, 'owner-a@senno.dev', 'owner123')

  const own = await page.request.get('/api/reports/e2e-clinic-a/pdf')
  expect(own.status()).toBe(200)

  const other = await page.request.get('/api/reports/e2e-clinic-b/pdf')
  expect(other.status()).toBe(403)
})
