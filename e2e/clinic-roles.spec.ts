import { expect, test, type Page } from '@playwright/test'

/**
 * Teste 10(b) — cargos de clínica (seed `seed-e2e`, senha cargo123):
 * - visibilidade de ABA por cargo (sidebar + gate de rota);
 * - visibilidade de DASHBOARD por cargo (seção + item desligado);
 * - deny-by-default (sem cargo → expulso);
 * - isolamento cross-clínica por STAFF (não só por owner);
 * - permissão por MÓDULO nas rotas de export.
 */

async function login(page: Page, email: string, password = 'cargo123') {
  await page.goto('/login')
  const accept = page.getByRole('dialog', { name: 'Aviso de cookies' }).getByRole('button', {
    name: 'Entendi',
  })
  if (await accept.isVisible().catch(() => false)) await accept.click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test('atendente: dashboard só comercial, item no-show desligado, financeiro bloqueado', async ({
  page,
}) => {
  await login(page, 'atendente-a@senno.dev')
  await expect(page).toHaveURL(/\/overview/, { timeout: 30_000 })

  // Seção comercial liberada… (timeout largo: o Suspense do dashboard espera
  // as queries de KPI/metas no Neon — streaming pode passar dos 5s default.)
  await expect(page.getByText('Leads totais')).toBeVisible({ timeout: 30_000 })
  // …mas o ITEM noShow foi desligado no cargo (gate por item).
  await expect(page.getByText('No-show', { exact: true })).toHaveCount(0)
  // Seção financeira inteira desligada.
  await expect(page.getByText('Faturamento', { exact: true })).toHaveCount(0)

  // Aba Financeiro: fora da sidebar E rota redireciona p/ /overview.
  await expect(page.getByRole('link', { name: 'Financeiro' })).toHaveCount(0)
  await page.goto('/financial')
  await expect(page).toHaveURL(/\/overview/)
})

test('gerente: dashboard amplo (inclui no-show e faturamento) + aba financeiro', async ({
  page,
}) => {
  await login(page, 'gerente-a@senno.dev')
  await expect(page).toHaveURL(/\/overview/, { timeout: 30_000 })

  // Timeout largo: gerente tem goals:viewAll → o dashboard computa o progresso
  // de TODAS as metas (N queries) antes do Suspense resolver.
  await expect(page.getByText('Leads totais')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('No-show', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Faturamento', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Financeiro' })).toBeVisible()
})

test('financeiro: aba financeiro abre, pacientes redireciona', async ({ page }) => {
  await login(page, 'financeiro-a@senno.dev')
  await expect(page).toHaveURL(/\/overview/, { timeout: 30_000 })

  await page.goto('/financial')
  await expect(page).toHaveURL(/\/financial/)

  await page.goto('/patients')
  await expect(page).toHaveURL(/\/overview/)
})

test('sem cargo: deny-by-default expulsa para /login', async ({ page }) => {
  await login(page, 'semcargo-a@senno.dev')
  // Autentica, mas o layout da clínica detecta zero abas e expulsa.
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })
})

test('export respeita o MÓDULO do cargo (financeiro lê receitas, não pacientes)', async ({
  page,
}) => {
  await login(page, 'financeiro-a@senno.dev')
  await expect(page).toHaveURL(/\/overview/, { timeout: 30_000 })

  const revenues = await page.request.get('/api/export/e2e-clinic-a/revenues')
  expect(revenues.status()).toBe(200)

  const patients = await page.request.get('/api/export/e2e-clinic-a/patients')
  expect(patients.status()).toBe(403)
})

test('export: atendente lê leads, não receitas', async ({ page }) => {
  await login(page, 'atendente-a@senno.dev')
  await expect(page).toHaveURL(/\/overview/, { timeout: 30_000 })

  const leads = await page.request.get('/api/export/e2e-clinic-a/leads')
  expect(leads.status()).toBe(200)

  const revenues = await page.request.get('/api/export/e2e-clinic-a/revenues')
  expect(revenues.status()).toBe(403)
})

test('isolamento por STAFF: atendente da Bravo não alcança a Alpha', async ({ page }) => {
  await login(page, 'atendente-b@senno.dev')
  await expect(page).toHaveURL(/\/overview/, { timeout: 30_000 })

  // Própria clínica → 200.
  const own = await page.request.get('/api/export/e2e-clinic-b/leads')
  expect(own.status()).toBe(200)

  // Clínica vizinha (IDOR via URL) → 403.
  const other = await page.request.get('/api/export/e2e-clinic-a/leads')
  expect(other.status()).toBe(403)

  // E na UI: pacientes da Bravo não incluem o paciente da Alpha.
  await page.goto('/patients')
  await expect(page.getByText('Paciente Bravo')).toBeVisible()
  await expect(page.getByText('Paciente Alpha')).toHaveCount(0)
})
