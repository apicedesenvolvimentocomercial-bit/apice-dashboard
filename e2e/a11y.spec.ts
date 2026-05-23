import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Audit de acessibilidade RUNTIME (axe-core) sobre o DOM renderizado — vai além
 * do eslint-plugin-jsx-a11y (estático). Falha em violações `serious`/`critical`;
 * violações menores são logadas mas não quebram (triagem manual).
 */

async function login(page: Page, email: string, password: string, expectUrl: RegExp) {
  await page.goto('/login')
  const accept = page
    .getByRole('dialog', { name: 'Aviso de cookies' })
    .getByRole('button', { name: 'Entendi' })
  if (await accept.isVisible().catch(() => false)) await accept.click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(expectUrl, { timeout: 30_000 })
}

async function expectNoSeriousA11y(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  )
  if (results.violations.length > 0) {
    console.log(
      `[a11y] ${label}: ${results.violations.length} violação(ões) — ` +
        results.violations.map((v) => `${v.id}(${v.impact})`).join(', ')
    )
  }
  expect(serious, `${label}: violações serious/critical`).toEqual([])
}

test('a11y — página de login', async ({ page }) => {
  await page.goto('/login')
  await expectNoSeriousA11y(page, 'login')
})

test('a11y — política de privacidade', async ({ page }) => {
  await page.goto('/privacidade')
  await expectNoSeriousA11y(page, 'privacidade')
})

test('a11y — dashboard do admin', async ({ page }) => {
  await login(page, 'admin@apice.dev', 'admin123', /\/dashboard/)
  await expectNoSeriousA11y(page, 'dashboard admin')
})

test('a11y — pacientes da clínica', async ({ page }) => {
  await login(page, 'owner-a@apice.dev', 'owner123', /\/overview/)
  await page.goto('/patients')
  await expectNoSeriousA11y(page, 'patients clínica')
})
