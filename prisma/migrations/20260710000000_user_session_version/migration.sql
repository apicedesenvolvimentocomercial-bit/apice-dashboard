-- Revogação de JWT stateless (auditoria de sessão 2026-07-10). O token carrega o
-- claim `sessionVersion`; getTenantContext (e o re-sync do jwt callback) rejeitam
-- todo token cujo version != o valor do banco. Incrementar a coluna no logout, na
-- troca de senha e no reset invalida TODAS as sessões daquele usuário na hora —
-- sem esperar o maxAge do cookie. DEFAULT 0 → tokens já emitidos (claim ausente,
-- lido como 0) continuam válidos no deploy; ninguém é deslogado à toa.

ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
