import { expect, test } from '@playwright/test'

/**
 * Fluxo autenticado contra o banco de teste (Neon, seed `db:seed`).
 * Credenciais do seed: admin@apice.dev / admin123.
 */

const ADMIN = { email: 'admin@apice.dev', password: 'admin123' }

async function dismissCookieBanner(page: import('@playwright/test').Page) {
  const accept = page.getByRole('dialog', { name: 'Aviso de cookies' }).getByRole('button', {
    name: 'Entendi',
  })
  if (await accept.isVisible().catch(() => false)) await accept.click()
}

test.describe('Login do admin', () => {
  test('loga e cai no dashboard do admin', async ({ page }) => {
    await page.goto('/login')
    await dismissCookieBanner(page)

    await page.getByLabel('Email').fill(ADMIN.email)
    await page.getByLabel('Senha').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Pós-login: callbackUrl '/' despacha ADMIN -> /dashboard.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('credencial errada mostra erro e não navega', async ({ page }) => {
    await page.goto('/login')
    await dismissCookieBanner(page)

    await page.getByLabel('Email').fill(ADMIN.email)
    await page.getByLabel('Senha').fill('senha-errada')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByText('Email ou senha inválidos')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })
})
