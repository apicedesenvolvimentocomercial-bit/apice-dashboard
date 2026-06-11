import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guarda do titular (auditoria 2026-06-10, Crítico 2): `removeClinicUserAction`
 * NÃO pode remover o titular da clínica (Client.ownerId) — exige transferir a
 * titularidade antes. Espelha a guarda que já existia em staff-actions.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000', NEXT_PUBLIC_APP_NAME: 'Senno' },
}))
vi.mock('@/lib/resend', () => ({ resend: null, sendEmail: vi.fn() }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/server/repositories/client-repository', () => ({
  createClient: vi.fn(),
  softDeleteClient: vi.fn(),
  updateClient: vi.fn(),
}))
vi.mock('@/server/services/client-service', () => ({ createDefaultPipelineStages: vi.fn() }))
vi.mock('@/server/auth/assert-can', () => ({ assertCan: vi.fn(async () => {}) }))
vi.mock('@/server/repositories/audit-repository', () => ({
  createAuditLog: vi.fn(async () => {}),
}))
vi.mock('@/server/tenant/context', () => ({
  getTenantContext: vi.fn(async () => ({
    userId: 'actor-id',
    organizationId: 'org-1',
    role: 'CLIENT_OWNER',
    clientId: null,
    clinicRoleId: null,
  })),
  assertClientAccess: vi.fn(async () => {}),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
    client: { findFirst: vi.fn() },
    session: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))

import { prisma } from '@/lib/prisma'

import { removeClinicUserAction } from './client-actions'

const mockUserFindFirst = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>
const mockClientFindFirst = prisma.client.findFirst as unknown as ReturnType<typeof vi.fn>
const mockTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>

// O zod da action exige cuid() — ids em formato válido.
const CLIENT_ID = 'cjld2cjxh0000qzrmn831i7rn'
const TARGET_ID = 'cjld2cyuq0000t3rmniod1foy'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('removeClinicUserAction — titular irremovível', () => {
  it('alvo é o titular (Client.ownerId) → falha sem tocar no usuário', async () => {
    mockUserFindFirst.mockResolvedValue({ id: TARGET_ID, email: 'titular@x.com' })
    mockClientFindFirst.mockResolvedValue({ ownerId: TARGET_ID })

    const result = await removeClinicUserAction({ clientId: CLIENT_ID, userId: TARGET_ID })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toMatch(/titular/i)
    }
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('alvo comum → desativa + apaga sessões na transação', async () => {
    mockUserFindFirst.mockResolvedValue({ id: TARGET_ID, email: 'staff@x.com' })
    mockClientFindFirst.mockResolvedValue({ ownerId: 'outro-user' })

    const result = await removeClinicUserAction({ clientId: CLIENT_ID, userId: TARGET_ID })

    expect(result.success).toBe(true)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    const updateArg = (prisma.user.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateArg.data.isActive).toBe(false)
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date)
  })
})
