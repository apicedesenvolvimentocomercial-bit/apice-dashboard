import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `assertCan` = gate de permissão E chokepoint do rate-limit de mutações
 * (anti-DoS por volume): write/delete/assignToOthers consomem o orçamento do
 * usuário ANTES de resolver a permissão; read/viewAll ficam livres (SSR,
 * buscas e filtros não podem ser bloqueados).
 */

vi.mock('./permissions', () => ({ can: vi.fn(async () => true) }))
vi.mock('@/server/security/mutation-throttle', () => ({
  assertMutationBudget: vi.fn(async () => {}),
}))

import { ForbiddenError, TooManyRequestsError } from '@/types/errors'
import { assertMutationBudget } from '@/server/security/mutation-throttle'

import { assertCan } from './assert-can'
import { can } from './permissions'

const budget = assertMutationBudget as unknown as ReturnType<typeof vi.fn>
const canMock = can as unknown as ReturnType<typeof vi.fn>

const ctx = { userId: 'user-1', role: 'CLIENT_STAFF' } as Parameters<typeof assertCan>[0]

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks não desfaz mockResolvedValue/mockRejectedValue — restaura o default.
  budget.mockImplementation(async () => {})
  canMock.mockImplementation(async () => true)
})

describe('assertCan — rate-limit de mutações (chokepoint)', () => {
  it.each(['write', 'delete', 'assignToOthers'] as const)(
    'consome o orçamento do usuário em %s',
    async (action) => {
      await assertCan(ctx, 'crm', action)
      expect(budget).toHaveBeenCalledWith('user-1')
    }
  )

  it.each(['read', 'viewAll'] as const)('NÃO consome orçamento em %s', async (action) => {
    await assertCan(ctx, 'crm', action)
    expect(budget).not.toHaveBeenCalled()
  })

  it('orçamento estourado → rejeita ANTES de resolver a permissão', async () => {
    budget.mockRejectedValue(new TooManyRequestsError())
    await expect(assertCan(ctx, 'crm', 'write')).rejects.toBeInstanceOf(TooManyRequestsError)
    expect(canMock).not.toHaveBeenCalled()
  })

  it('permissão negada segue lançando ForbiddenError (com orçamento ok)', async () => {
    canMock.mockResolvedValue(false)
    await expect(assertCan(ctx, 'crm', 'write')).rejects.toBeInstanceOf(ForbiddenError)
  })
})
