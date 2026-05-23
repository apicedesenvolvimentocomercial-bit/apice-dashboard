import { expect, test } from '@playwright/test'

/**
 * Smoke E2E de rotas PÚBLICAS (sem auth, sem DB). Rodável em qualquer ambiente
 * com a app no ar. Fluxos autenticados (login → dashboard, isolamento de
 * clínica) ficam para quando houver DB de teste (decisão D2 do ledger).
 */

test.describe('Páginas públicas', () => {
  test('política de privacidade renderiza e cobre LGPD/cookies', async ({ page }) => {
    await page.goto('/privacidade')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Política de Privacidade' })
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cookies' })).toBeVisible()
  })

  test('login mostra a marca e link para a política', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'KPI Clinic OS' })).toBeVisible()
    // Dispensa o banner de cookies primeiro — ele também tem um link p/ a
    // política, o que criaria duas correspondências (strict mode). Sobra o link
    // do rodapé do login.
    await page
      .getByRole('dialog', { name: 'Aviso de cookies' })
      .getByRole('button', { name: 'Entendi' })
      .click()
    const policyLink = page.getByRole('link', { name: 'Política de Privacidade' })
    await expect(policyLink).toBeVisible()
    await policyLink.click()
    await expect(page).toHaveURL(/\/privacidade$/)
  })

  test('banner de cookies aparece e some ao aceitar', async ({ page }) => {
    await page.goto('/login')
    const banner = page.getByRole('dialog', { name: 'Aviso de cookies' })
    await expect(banner).toBeVisible()
    await banner.getByRole('button', { name: 'Entendi' }).click()
    await expect(banner).toBeHidden()
    // Persistência: ao recarregar, não reaparece.
    await page.reload()
    await expect(banner).toBeHidden()
  })
})
