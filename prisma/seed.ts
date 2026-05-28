import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  const org = await prisma.organization.upsert({
    where: { slug: 'senno' },
    update: {},
    create: {
      name: 'Senno',
      slug: 'senno',
    },
  })

  const adminHash = await hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@senno.dev' },
    update: {},
    create: {
      email: 'admin@senno.dev',
      name: 'Admin',
      passwordHash: adminHash,
      role: 'ADMIN',
      isActive: true,
      organizationId: org.id,
    },
  })

  // Garante que a organização tenha um dono (coroa). Como o seed roda em
  // ordem (org → admin), a migration de backfill não tinha o admin ainda;
  // este passo cobre o caso de banco recém-seedado.
  if (!org.ownerId) {
    await prisma.organization.update({
      where: { id: org.id },
      data: { ownerId: admin.id },
    })
  }

  // Cargo de agência de exemplo. Com deny-by-default, STAFF SEM cargo fica sem
  // nenhum acesso — então o seed cria um "Gerente" (nível 1) com acesso amplo e
  // o atribui ao STAFF demo, senão ele cairia direto no /login.
  const managerPermissions = {
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
  }
  const managerRole = await prisma.agencyRole.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Gerente' } },
    update: { permissions: managerPermissions, level: 1 },
    create: {
      organizationId: org.id,
      name: 'Gerente',
      permissions: managerPermissions,
      canManageRoles: false,
      level: 1,
    },
  })

  const staffHash = await hash('staff123', 12)
  await prisma.user.upsert({
    where: { email: 'staff@senno.dev' },
    update: { agencyRoleId: managerRole.id },
    create: {
      email: 'staff@senno.dev',
      name: 'Staff Demo',
      passwordHash: staffHash,
      role: 'STAFF',
      isActive: true,
      organizationId: org.id,
      agencyRoleId: managerRole.id,
    },
  })

  console.log('✅ Seed concluído!')
  console.log(`   Org: ${org.name} (${org.slug})`)
  console.log(`   Admin: ${admin.email} / admin123`)
  console.log(`   Staff: staff@senno.dev / staff123 (cargo: Gerente)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
