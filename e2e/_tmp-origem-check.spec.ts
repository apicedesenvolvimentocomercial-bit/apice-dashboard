import { test, expect } from '@playwright/test'

/** TEMPORÁRIO — diagnóstico do select "Origem" do popup global "Novo lead". */
test('Origem nasce vazia no popup do topbar', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/e-?mail/i).fill('owner-a@senno.dev')
  await page.getByLabel(/senha/i).fill('owner123')
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL(/\/(dashboard|crm)?/, { timeout: 30_000 })

  await page
    .getByRole('button', { name: /novo lead/i })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })

  const dialog = page.getByRole('dialog')
  const trigger = dialog.getByRole('combobox').first()
  const texto = (await trigger.textContent())?.trim()

  console.log('>>> TEXTO DO TRIGGER DE ORIGEM:', JSON.stringify(texto))
  await page.screenshot({ path: 'e2e/_tmp-origem.png' })

  expect(texto).not.toBe('Outro')
})
