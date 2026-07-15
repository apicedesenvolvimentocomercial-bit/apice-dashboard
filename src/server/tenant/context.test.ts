import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Ciclo de vida do usuário × sessão (auditoria 2026-06-10, Crítico 1).
 *
 * `getTenantContext` decide autorização pelo DB, não pelo cookie: usuário
 * desativado/removido perde acesso no request seguinte mesmo com JWT válido,
 * e os claims (role/clientId/clinicRoleId) saem FRESCOS do banco — mudança de
 * cargo vale na hora, sem esperar o re-sync de 10min do token.
 */

vi.mock('@/server/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() }, client: { findFirst: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { auth } from '@/server/auth'
import { UnauthorizedError } from '@/types/errors'

import { getTenantContext } from './context'

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>

// userId DIFERENTE por teste: `cache()` do React memoiza por argumento dentro
// de um "request" — ids distintos garantem que cada caso consulta o mock.
function session(userId: string, sessionVersion = 0) {
  return {
    user: {
      id: userId,
      role: 'CLIENT_STAFF',
      organizationId: 'org-from-jwt',
      clientId: 'clinic-from-jwt',
      clinicRoleId: 'role-from-jwt',
      sessionVersion,
    },
  }
}

const ACTIVE = {
  organizationId: 'org-db',
  role: 'CLIENT_STAFF',
  clientId: 'clinic-db',
  clinicRoleId: 'role-db',
  sessionVersion: 0,
  isActive: true,
  deletedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getTenantContext — usuário desativado/removido perde acesso na hora', () => {
  it('sem sessão → UnauthorizedError', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(getTenantContext()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('usuário sumiu do DB (hard delete) → UnauthorizedError', async () => {
    mockAuth.mockResolvedValue(session('user-gone'))
    mockFindUnique.mockResolvedValue(null)
    await expect(getTenantContext()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('isActive=false → UnauthorizedError mesmo com JWT válido', async () => {
    mockAuth.mockResolvedValue(session('user-inactive'))
    mockFindUnique.mockResolvedValue({ ...ACTIVE, isActive: false })
    await expect(getTenantContext()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('deletedAt setado (soft delete) → UnauthorizedError', async () => {
    mockAuth.mockResolvedValue(session('user-deleted'))
    mockFindUnique.mockResolvedValue({ ...ACTIVE, deletedAt: new Date() })
    await expect(getTenantContext()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('sem organizationId no DB → UnauthorizedError', async () => {
    mockAuth.mockResolvedValue(session('user-orgless'))
    mockFindUnique.mockResolvedValue({ ...ACTIVE, organizationId: null })
    await expect(getTenantContext()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('sessionVersion do token < DB (revogado por logout/troca de senha) → UnauthorizedError', async () => {
    // Token carrega version 0; o DB avançou p/ 1 (logout global / reset de senha).
    // O token está morto: nega o acesso a dados JÁ no próximo request.
    mockAuth.mockResolvedValue(session('user-revoked', 0))
    mockFindUnique.mockResolvedValue({ ...ACTIVE, sessionVersion: 1 })
    await expect(getTenantContext()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('sessionVersion do token == DB → acesso liberado', async () => {
    mockAuth.mockResolvedValue(session('user-ok-version', 3))
    mockFindUnique.mockResolvedValue({ ...ACTIVE, sessionVersion: 3 })
    await expect(getTenantContext()).resolves.toMatchObject({ userId: 'user-ok-version' })
  })
})

describe('getTenantContext — claims frescos do DB (não do JWT)', () => {
  it('role/clientId/clinicRoleId vêm do DB, não do token', async () => {
    mockAuth.mockResolvedValue(session('user-fresh'))
    mockFindUnique.mockResolvedValue(ACTIVE)

    const ctx = await getTenantContext()
    // Os valores "-from-jwt" do session NÃO podem vencer os do DB: é isso que
    // elimina a janela de 10min em mudança de cargo/role.
    expect(ctx.organizationId).toBe('org-db')
    expect(ctx.clientId).toBe('clinic-db')
    expect(ctx.clinicRoleId).toBe('role-db')
    expect(ctx.userId).toBe('user-fresh')
  })
})
