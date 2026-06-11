import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

/**
 * Cria (de forma idempotente) um acesso beta para a clínica "LuCorreia
 * Estética": a clínica em si (com o funil padrão) e um usuário CLIENT_OWNER
 * que enxerga apenas os dados dela.
 *
 * Rodar: npx tsx prisma/seed-lucorreia.ts
 *
 * Observações:
 * - A senha é 123456 (o login exige >= 6 caracteres; "123" seria rejeitado).
 * - O email é gravado em minúsculas porque o login faz match exato por email.
 */

const ORG_SLUG = 'senno'
const CLINIC_NAME = 'LuCorreia Estética'
const CLINIC_SLUG = 'lucorreia-estetica'
const OWNER_EMAIL = 'lucorreiaesteticacwb@gmail.com'
const OWNER_PASSWORD = '123456'

// Mesmas pipelines nativas de ensureNativePipelines (inline para manter o
// script standalone, sem depender do alias @/ da app).
const COMMERCIAL_STAGES = [
  {
    name: 'Lead',
    order: 0,
    color: '#6366f1',
    isWon: false,
    isLost: false,
    isNative: true,
    nativeKey: 'LEAD' as const,
  },
  {
    name: 'Agendado',
    order: 1,
    color: '#f59e0b',
    isWon: false,
    isLost: false,
    isNative: true,
    nativeKey: 'SCHEDULED' as const,
  },
  {
    name: 'Compareceu',
    order: 2,
    color: '#3b82f6',
    isWon: false,
    isLost: false,
    isNative: true,
    nativeKey: 'ATTENDED' as const,
  },
  {
    name: 'Fechado',
    order: 3,
    color: '#10b981',
    isWon: true,
    isLost: false,
    isNative: true,
    nativeKey: 'CLOSED' as const,
  },
  {
    name: 'No-show',
    order: 4,
    color: '#ef4444',
    isWon: false,
    isLost: true,
    isNative: true,
    nativeKey: 'NO_SHOW' as const,
  },
]
const RETENTION_STAGES = [
  {
    name: 'Ativo',
    order: 0,
    color: '#22c55e',
    isWon: false,
    isLost: false,
    isNative: true,
    nativeKey: 'ACTIVE' as const,
  },
  {
    name: 'Inativo',
    order: 1,
    color: '#94a3b8',
    isWon: false,
    isLost: false,
    isNative: true,
    nativeKey: 'INACTIVE' as const,
  },
]

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Criando acesso beta da LuCorreia Estética...')

  const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } })
  if (!org) {
    throw new Error(
      `Organização "${ORG_SLUG}" não encontrada. Rode o seed principal antes (npm run db:seed).`
    )
  }

  // Clínica — idempotente por (organizationId, slug), que é a chave única no
  // banco. Inclui registros soft-deletados para não bater no unique ao criar.
  let clinic = await prisma.client.findFirst({
    where: { organizationId: org.id, slug: CLINIC_SLUG },
  })
  if (!clinic) {
    clinic = await prisma.client.create({
      data: {
        organizationId: org.id,
        name: CLINIC_NAME,
        slug: CLINIC_SLUG,
        status: 'ACTIVE',
      },
    })
    console.log(`   Clínica criada: ${clinic.name}`)
  } else {
    // Já existe — reativa se estava soft-deletada/inativa. Mantém o nome
    // atual para não sobrescrever algo que a clínica já usa.
    clinic = await prisma.client.update({
      where: { id: clinic.id },
      data: {
        deletedAt: null,
        ...(clinic.status === 'INACTIVE' ? { status: 'ACTIVE' } : {}),
      },
    })
    console.log(`   Clínica já existia: ${clinic.name} (reaproveitada)`)
  }

  // Pipelines nativas — só cria as que faltam.
  const pipelineCount = await prisma.pipeline.count({ where: { clientId: clinic.id } })
  if (pipelineCount === 0) {
    await prisma.pipeline.create({
      data: {
        organizationId: org.id,
        clientId: clinic.id,
        name: 'Comercial',
        kind: 'COMMERCIAL',
        order: 0,
        stages: { create: COMMERCIAL_STAGES.map((s) => ({ ...s, clientId: clinic.id })) },
      },
    })
    await prisma.pipeline.create({
      data: {
        organizationId: org.id,
        clientId: clinic.id,
        name: 'Retenção',
        kind: 'RETENTION',
        order: 1,
        stages: { create: RETENTION_STAGES.map((s) => ({ ...s, clientId: clinic.id })) },
      },
    })
    console.log('   Pipelines nativas criadas.')
  }

  // Usuário CLIENT_OWNER — idempotente por email (único).
  const passwordHash = await hash(OWNER_PASSWORD, 12)
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {
      // Reativa e reanexa caso já exista (mantém o acesso utilizável).
      passwordHash,
      role: 'CLIENT_OWNER',
      isActive: true,
      organizationId: org.id,
      clientId: clinic.id,
      deletedAt: null,
    },
    create: {
      email: OWNER_EMAIL,
      name: 'LuCorreia Estética',
      passwordHash,
      role: 'CLIENT_OWNER',
      isActive: true,
      organizationId: org.id,
      clientId: clinic.id,
    },
  })

  // Coroa da clínica: com deny-by-default, um CLIENT_OWNER que NÃO é titular e
  // não tem cargo fica trancado (gate expulsa p/ /login). Setar Client.ownerId
  // = a coroa, que dá acesso total. Ela é a dona da própria clínica.
  if (clinic.ownerId !== owner.id) {
    await prisma.client.update({ where: { id: clinic.id }, data: { ownerId: owner.id } })
  }

  // ── Cargos + acessos de TESTE (espelham o seed E2E; senha cargo123).
  // ATENÇÃO: contas de teste em PRODUÇÃO — remova após validar (lista de
  // pessoas em /configuracoes, ou rode um cleanup).
  const fullTab = { access: true, read: true, write: true, delete: false }
  const cargoHash = await hash('cargo123', 12)

  // Níveis únicos por clínica: se o nível desejado já está ocupado por um
  // cargo de OUTRO nome (criado à mão), usa o próximo livre.
  const existingRoles = await prisma.clinicRole.findMany({
    where: { clientId: clinic.id },
    select: { name: true, level: true },
  })
  const usedLevels = new Set(existingRoles.map((r) => r.level))
  const byName = new Map(existingRoles.map((r) => [r.name, r.level]))
  function pickLevel(name: string, desired: number): number {
    const current = byName.get(name)
    if (current !== undefined) return current // cargo já existe: mantém o nível
    let lvl = desired
    while (usedLevels.has(lvl)) lvl++
    usedLevels.add(lvl)
    return lvl
  }

  const cargoDefs = [
    {
      name: 'Gerente',
      desiredLevel: 1,
      canManageRoles: true,
      permissions: {
        crm: { ...fullTab, assignToOthers: true, viewAll: true },
        appointments: { ...fullTab, assignToOthers: true, viewAll: true },
        activities: { ...fullTab, assignToOthers: true, viewAll: true },
        patients: fullTab,
        financial: fullTab,
        goals: { ...fullTab, viewAll: true },
        insights: { access: true, read: true },
        procedures: fullTab,
        reports: { access: true, read: true },
        staff: { access: true, read: true, write: true }, // pode convidar
        dashboard: {
          commercialKpis: { access: true },
          financialKpis: { access: true },
          tracking: { access: true },
        },
      },
    },
    {
      name: 'Atendente',
      desiredLevel: 2,
      canManageRoles: false,
      permissions: {
        crm: fullTab,
        appointments: fullTab,
        activities: fullTab,
        patients: fullTab,
        dashboard: { commercialKpis: { access: true, items: { noShow: false } } },
      },
    },
    {
      name: 'Financeiro',
      desiredLevel: 3,
      canManageRoles: false,
      permissions: {
        financial: fullTab,
        reports: { access: true, read: true },
        dashboard: { financialKpis: { access: true }, revenueCharts: { access: true } },
      },
    },
  ]

  const roleIdByName = new Map<string, string>()
  for (const def of cargoDefs) {
    const role = await prisma.clinicRole.upsert({
      where: { clientId_name: { clientId: clinic.id, name: def.name } },
      update: { permissions: def.permissions, canManageRoles: def.canManageRoles },
      create: {
        clientId: clinic.id,
        name: def.name,
        level: pickLevel(def.name, def.desiredLevel),
        canManageRoles: def.canManageRoles,
        permissions: def.permissions,
      },
    })
    roleIdByName.set(def.name, role.id)
  }

  const testUsers = [
    { email: 'gerente-lucorreia@senno.dev', name: 'Gerente (teste)', role: 'Gerente' },
    { email: 'atendente-lucorreia@senno.dev', name: 'Atendente (teste)', role: 'Atendente' },
    { email: 'financeiro-lucorreia@senno.dev', name: 'Financeiro (teste)', role: 'Financeiro' },
    { email: 'semcargo-lucorreia@senno.dev', name: 'Sem Cargo (teste)', role: null },
  ] as const
  for (const u of testUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        clientId: clinic.id,
        clinicRoleId: u.role ? roleIdByName.get(u.role) : null,
        isActive: true,
        deletedAt: null,
        passwordHash: cargoHash,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash: cargoHash,
        role: 'CLIENT_STAFF',
        isActive: true,
        organizationId: org.id,
        clientId: clinic.id,
        clinicRoleId: u.role ? roleIdByName.get(u.role) : null,
      },
    })
  }

  console.log('✅ Pronto!')
  console.log(`   Clínica: ${CLINIC_NAME}`)
  console.log(`   Login: ${OWNER_EMAIL} / ${OWNER_PASSWORD} (CLIENT_OWNER)`)
  console.log('   Acessos de TESTE (senha cargo123 — remover após validar):')
  console.log('     gerente-lucorreia@senno.dev    (todas as abas + convite + dashboard amplo)')
  console.log('     atendente-lucorreia@senno.dev  (só comercial; dashboard sem no-show)')
  console.log('     financeiro-lucorreia@senno.dev (só financeiro + exportações)')
  console.log('     semcargo-lucorreia@senno.dev   (sem cargo → expulso no login)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
