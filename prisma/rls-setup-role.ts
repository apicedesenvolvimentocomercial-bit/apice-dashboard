/**
 * Cria o role de aplicação SEM BYPASSRLS (a RLS só vale para roles assim).
 * O role dono (neondb_owner / postgres) tem BYPASSRLS e ignora as policies —
 * por isso a app DEVE conectar como este role em vez do dono. Ver
 * `prompt/rls-gambiarra.md`. Roda como dono: npm run rls:setup-role
 */
import { PrismaClient } from '@prisma/client'

// Setup roda como DONO (CREATE ROLE / GRANT exigem o owner) — usa DIRECT_URL,
// não o DATABASE_URL (que aponta para o próprio app_user).
const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL })
const PASSWORD = process.env.APP_DB_PASSWORD ?? 'e2e_app_user_pw'

async function main() {
  await prisma.$executeRawUnsafe(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app_user') THEN
         CREATE ROLE app_user LOGIN PASSWORD '${PASSWORD}';
       END IF;
     END $$;`
  )
  // Role novo já nasce NOBYPASSRLS/NOSUPERUSER (não alteramos esses atributos —
  // mudar SUPERUSER exige ser superuser). Só (re)garantimos a senha.
  await prisma.$executeRawUnsafe(`ALTER ROLE app_user PASSWORD '${PASSWORD}'`)
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO app_user`)
  await prisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`
  )
  await prisma.$executeRawUnsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`
  )
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user`
  )
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user`
  )
  console.log('✅ Role app_user pronto (LOGIN, NOBYPASSRLS, com grants).')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
