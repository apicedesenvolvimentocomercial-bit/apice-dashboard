import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  const org = await prisma.organization.upsert({
    where: { slug: 'apice-desenvolvimento' },
    update: {},
    create: {
      name: 'Ápice Desenvolvimento',
      slug: 'apice-desenvolvimento',
    },
  })

  const adminHash = await hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@apice.dev' },
    update: {},
    create: {
      email: 'admin@apice.dev',
      name: 'Admin',
      passwordHash: adminHash,
      role: 'ADMIN',
      isActive: true,
      organizationId: org.id,
    },
  })

  const staffHash = await hash('staff123', 12)
  await prisma.user.upsert({
    where: { email: 'staff@apice.dev' },
    update: {},
    create: {
      email: 'staff@apice.dev',
      name: 'Staff Demo',
      passwordHash: staffHash,
      role: 'STAFF',
      isActive: true,
      organizationId: org.id,
    },
  })

  console.log('✅ Seed concluído!')
  console.log(`   Org: ${org.name} (${org.slug})`)
  console.log(`   Admin: ${admin.email} / admin123`)
  console.log(`   Staff: staff@apice.dev / staff123`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
