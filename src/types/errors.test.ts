import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { validationFail } from './errors'

/**
 * Fase 4 do plano de correções: erro de validação carrega o mapa de campos
 * (todas as issues), não só a 1ª mensagem como string genérica.
 */
describe('validationFail', () => {
  const schema = z.object({
    name: z.string().min(2, 'Nome obrigatório'),
    email: z.string().email('E-mail inválido'),
  })

  it('retorna VALIDATION_ERROR com fields por campo (todas as issues)', () => {
    const parsed = schema.safeParse({ name: '', email: 'x' })
    if (parsed.success) throw new Error('esperava falha')

    const res = validationFail(parsed.error)
    expect(res.success).toBe(false)
    expect(res.error.code).toBe('VALIDATION_ERROR')
    expect(res.error.message).toContain('Nome obrigatório') // 1ª issue na mensagem
    expect(res.error.fields).toMatchObject({
      name: ['Nome obrigatório'],
      email: ['E-mail inválido'],
    })
  })
})
