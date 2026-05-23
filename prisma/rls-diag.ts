import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const role = await prisma.$queryRaw`
    SELECT current_user AS role, rolsuper, rolbypassrls
    FROM pg_roles WHERE rolname = current_user`
  console.log('ROLE:', role)

  const rls = await prisma.$queryRaw`
    SELECT relname, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
    FROM pg_class WHERE relname = 'Patient'`
  console.log('PATIENT TABLE:', rls)

  const owner = await prisma.$queryRaw`
    SELECT tableowner FROM pg_tables WHERE tablename = 'Patient'`
  console.log('PATIENT OWNER:', owner)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
