import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

// Seed dedicado ao E2E (banco Neon descartável). Cria a org + admin/staff
// (igual ao seed principal) E DUAS clínicas com owners e um paciente em cada,
// para os testes de isolamento cross-tenant (clínica A não enxerga a B).
// Idempotente: ids fixos nas clínicas/pacientes; users por email.
const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding E2E database...')

  const org = await prisma.organization.upsert({
    where: { slug: 'senno' },
    update: {},
    create: { name: 'Senno', slug: 'senno' },
  })

  const admin = await prisma.user.upsert({
    where: { email: 'admin@senno.dev' },
    update: {},
    create: {
      email: 'admin@senno.dev',
      name: 'Admin',
      passwordHash: await hash('admin123', 12),
      role: 'ADMIN',
      isActive: true,
      organizationId: org.id,
    },
  })

  if (!org.ownerId) {
    await prisma.organization.update({ where: { id: org.id }, data: { ownerId: admin.id } })
  }

  // Cargo de agência p/ o STAFF (deny-by-default: STAFF sem cargo fica trancado).
  const agencyManager = await prisma.agencyRole.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Gerente' } },
    update: { level: 1 },
    create: {
      organizationId: org.id,
      name: 'Gerente',
      level: 1,
      permissions: {
        clients: { access: true, read: true, write: true, delete: false },
        crm: { access: true, read: true, write: true, delete: false },
        activities: {
          access: true,
          read: true,
          write: true,
          delete: false,
          assignToOthers: true,
          viewAll: true,
        },
        calendar: { access: true, read: true, write: true, delete: false },
        staff: { access: true, read: true, write: false, delete: false },
      },
    },
  })

  await prisma.user.upsert({
    where: { email: 'staff@senno.dev' },
    update: { agencyRoleId: agencyManager.id },
    create: {
      email: 'staff@senno.dev',
      name: 'Staff Demo',
      passwordHash: await hash('staff123', 12),
      role: 'STAFF',
      isActive: true,
      organizationId: org.id,
      agencyRoleId: agencyManager.id,
    },
  })

  // Duas clínicas (tenants) sob a mesma org.
  const clinicA = await prisma.client.upsert({
    where: { id: 'e2e-clinic-a' },
    update: {},
    create: {
      id: 'e2e-clinic-a',
      organizationId: org.id,
      name: 'Clínica Alpha',
      slug: 'clinica-alpha',
    },
  })
  const clinicB = await prisma.client.upsert({
    where: { id: 'e2e-clinic-b' },
    update: {},
    create: {
      id: 'e2e-clinic-b',
      organizationId: org.id,
      name: 'Clínica Bravo',
      slug: 'clinica-bravo',
    },
  })

  // Owner de cada clínica (role CLIENT_OWNER, clientId fixado).
  const ownerHash = await hash('owner123', 12)
  const ownerA = await prisma.user.upsert({
    where: { email: 'owner-a@senno.dev' },
    update: { clientId: clinicA.id },
    create: {
      email: 'owner-a@senno.dev',
      name: 'Dono Alpha',
      passwordHash: ownerHash,
      role: 'CLIENT_OWNER',
      isActive: true,
      organizationId: org.id,
      clientId: clinicA.id,
    },
  })
  const ownerB = await prisma.user.upsert({
    where: { email: 'owner-b@senno.dev' },
    update: { clientId: clinicB.id },
    create: {
      email: 'owner-b@senno.dev',
      name: 'Dono Bravo',
      passwordHash: ownerHash,
      role: 'CLIENT_OWNER',
      isActive: true,
      organizationId: org.id,
      clientId: clinicB.id,
    },
  })

  // Coroa de cada clínica: sem isto, o deny-by-default tranca os owners (eles
  // não têm cargo e a titularidade é o que dá acesso total).
  await prisma.client.update({ where: { id: clinicA.id }, data: { ownerId: ownerA.id } })
  await prisma.client.update({ where: { id: clinicB.id }, data: { ownerId: ownerB.id } })

  // Um paciente distinguível em cada clínica — usado p/ provar isolamento na UI.
  await prisma.patient.upsert({
    where: { id: 'e2e-patient-a' },
    update: {},
    create: {
      id: 'e2e-patient-a',
      organizationId: org.id,
      clientId: clinicA.id,
      name: 'Paciente Alpha',
    },
  })
  await prisma.patient.upsert({
    where: { id: 'e2e-patient-b' },
    update: {},
    create: {
      id: 'e2e-patient-b',
      organizationId: org.id,
      clientId: clinicB.id,
      name: 'Paciente Bravo',
    },
  })

  // ── Cargos de clínica + staff variado (teste 10b: visibilidade de aba e de
  // dashboard por cargo; isolamento por staff). Senha de todos: cargo123.
  const cargoHash = await hash('cargo123', 12)

  const fullTab = { access: true, read: true, write: true, delete: false }

  // Permissões SEMPRE re-gravadas no upsert (update + create): o Neon pode ter
  // cargos homônimos criados à mão em testes manuais — `update:{}` preservaria
  // o JSON antigo e o E2E asserta o shape daqui. `level` fica só no create
  // (re-gravar arriscaria colidir o unique [clientId, level]).
  const gerentePerms = {
    crm: { ...fullTab, assignToOthers: true, viewAll: true },
    appointments: { ...fullTab, assignToOthers: true, viewAll: true },
    activities: { ...fullTab, assignToOthers: true, viewAll: true },
    patients: fullTab,
    financial: fullTab,
    goals: { ...fullTab, viewAll: true },
    insights: { access: true, read: true },
    procedures: fullTab,
    reports: { access: true, read: true },
    // Capacidade sem aba: convidar pessoas (checkbox "Pode convidar" do cargo).
    staff: { access: true, read: true, write: true },
    dashboard: {
      commercialKpis: { access: true },
      financialKpis: { access: true },
      tracking: { access: true },
    },
  }

  // Gerente (level 1): todas as abas + dashboard amplo + gerencia cargos.
  const gerenteA = await prisma.clinicRole.upsert({
    where: { clientId_name: { clientId: clinicA.id, name: 'Gerente' } },
    update: { permissions: gerentePerms, canManageRoles: true },
    create: {
      clientId: clinicA.id,
      name: 'Gerente',
      level: 1,
      canManageRoles: true,
      permissions: gerentePerms,
    },
  })

  // Atendente (level 2): só operação comercial — SEM financeiro/metas/insights/
  // procedimentos/exportações. Dashboard: só KPIs comerciais, com o item
  // "noShow" explicitamente DESLIGADO (testa o gate por item).
  const atendentePerms = {
    crm: fullTab,
    appointments: fullTab,
    activities: fullTab,
    patients: fullTab,
    dashboard: {
      commercialKpis: { access: true, items: { noShow: false } },
    },
  }
  const atendenteA = await prisma.clinicRole.upsert({
    where: { clientId_name: { clientId: clinicA.id, name: 'Atendente' } },
    update: { permissions: atendentePerms },
    create: {
      clientId: clinicA.id,
      name: 'Atendente',
      level: 2,
      permissions: atendentePerms,
    },
  })

  // Financeiro (level 3): só dinheiro + exportações. Dashboard financeiro.
  const financeiroPerms = {
    financial: fullTab,
    reports: { access: true, read: true },
    dashboard: {
      financialKpis: { access: true },
      revenueCharts: { access: true },
    },
  }
  const financeiroA = await prisma.clinicRole.upsert({
    where: { clientId_name: { clientId: clinicA.id, name: 'Financeiro' } },
    update: { permissions: financeiroPerms },
    create: {
      clientId: clinicA.id,
      name: 'Financeiro',
      level: 3,
      permissions: financeiroPerms,
    },
  })

  // Espelho na clínica B (isolamento por STAFF, não só por owner).
  const atendenteBPerms = {
    crm: fullTab,
    appointments: fullTab,
    patients: fullTab,
    dashboard: { commercialKpis: { access: true } },
  }
  const atendenteB = await prisma.clinicRole.upsert({
    where: { clientId_name: { clientId: clinicB.id, name: 'Atendente' } },
    update: { permissions: atendenteBPerms },
    create: {
      clientId: clinicB.id,
      name: 'Atendente',
      level: 2,
      permissions: atendenteBPerms,
    },
  })

  const staffUsers: { email: string; name: string; clientId: string; roleId: string | null }[] = [
    {
      email: 'gerente-a@senno.dev',
      name: 'Gerente Alpha',
      clientId: clinicA.id,
      roleId: gerenteA.id,
    },
    {
      email: 'atendente-a@senno.dev',
      name: 'Atendente Alpha',
      clientId: clinicA.id,
      roleId: atendenteA.id,
    },
    {
      email: 'financeiro-a@senno.dev',
      name: 'Financeiro Alpha',
      clientId: clinicA.id,
      roleId: financeiroA.id,
    },
    // Sem cargo: deny-by-default deve expulsar p/ /login.
    { email: 'semcargo-a@senno.dev', name: 'Sem Cargo Alpha', clientId: clinicA.id, roleId: null },
    {
      email: 'atendente-b@senno.dev',
      name: 'Atendente Bravo',
      clientId: clinicB.id,
      roleId: atendenteB.id,
    },
  ]
  for (const u of staffUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { clientId: u.clientId, clinicRoleId: u.roleId },
      create: {
        email: u.email,
        name: u.name,
        passwordHash: cargoHash,
        role: 'CLIENT_STAFF',
        isActive: true,
        organizationId: org.id,
        clientId: u.clientId,
        clinicRoleId: u.roleId,
      },
    })
  }

  console.log('✅ Seed E2E concluído!')
  console.log('   Admin: admin@senno.dev / admin123')
  console.log('   Owner A: owner-a@senno.dev / owner123 (Clínica Alpha → Paciente Alpha)')
  console.log('   Owner B: owner-b@senno.dev / owner123 (Clínica Bravo → Paciente Bravo)')
  console.log('   Staff (senha cargo123):')
  console.log('     gerente-a@senno.dev    (Alpha, todas as abas + dashboard amplo)')
  console.log('     atendente-a@senno.dev  (Alpha, só comercial; dashboard sem noShow)')
  console.log('     financeiro-a@senno.dev (Alpha, só financeiro+exportações)')
  console.log('     semcargo-a@senno.dev   (Alpha, SEM cargo → deny-by-default)')
  console.log('     atendente-b@senno.dev  (Bravo, só comercial)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
