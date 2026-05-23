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
  await login(page, 'owner-a@apice.dev', 'owner123')
  await page.goto('/patients')
  await expect(page.getByText('Paciente Alpha')).toBeVisible()
  await expect(page.getByText('Paciente Bravo')).toHaveCount(0)
})

test('owner da Clínica Bravo vê só o paciente da Bravo', async ({ page }) => {
  await login(page, 'owner-b@apice.dev', 'owner123')
  await page.goto('/patients')
  await expect(page.getByText('Paciente Bravo')).toBeVisible()
  await expect(page.getByText('Paciente Alpha')).toHaveCount(0)
})
