-- Rebrand Ápice → Senno: atualiza dados existentes no banco.
-- Org da agência: nome + slug.
UPDATE "Organization"
SET "name" = 'Senno', "slug" = 'senno'
WHERE "slug" = 'apice-desenvolvimento';

-- Emails @apice.dev → @senno.dev (admin, staff, owners de seed).
UPDATE "User"
SET "email" = REPLACE("email", '@apice.dev', '@senno.dev')
WHERE "email" LIKE '%@apice.dev';

-- Sessões NextAuth não armazenam email (JWT), então não precisam de invalidação
-- explícita aqui. O nome do usuário e o orgId no token continuam válidos.
