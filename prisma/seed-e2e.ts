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
    where: { slug: 'apice-desenvolvimento' },
    update: {},
    create: { name: 'Ápice Desenvolvimento', slug: 'apice-desenvolvimento' },
  })

  const admin = await prisma.user.upsert({
    where: { email: 'admin@apice.dev' },
    update: {},
    create: {
      email: 'admin@apice.dev',
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
    where: { email: 'staff@apice.dev' },
    update: { agencyRoleId: agencyManager.id },
    create: {
      email: 'staff@apice.dev',
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
    where: { email: 'owner-a@apice.dev' },
    update: { clientId: clinicA.id },
    create: {
      email: 'owner-a@apice.dev',
      name: 'Dono Alpha',
      passwordHash: ownerHash,
      role: 'CLIENT_OWNER',
      isActive: true,
      organizationId: org.id,
      clientId: clinicA.id,
    },
  })
  const ownerB = await prisma.user.upsert({
    where: { email: 'owner-b@apice.dev' },
    update: { clientId: clinicB.id },
    create: {
      email: 'owner-b@apice.dev',
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

  console.log('✅ Seed E2E concluído!')
  console.log('   Admin: admin@apice.dev / admin123')
  console.log('   Owner A: owner-a@apice.dev / owner123 (Clínica Alpha → Paciente Alpha)')
  console.log('   Owner B: owner-b@apice.dev / owner123 (Clínica Bravo → Paciente Bravo)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
