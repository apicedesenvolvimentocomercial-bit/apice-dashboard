import { describe, expect, it } from 'vitest'

/**
 * Guarda anti-amplificação de fan-out (broadcast-guard). Puro, sem DB: mede o
 * payload replicado por destinatário e decide contra o orçamento total.
 */

import { ValidationError } from '@/types/errors'

import {
  assertBroadcastBudget,
  checkBroadcastBudget,
  MAX_BROADCAST_RECIPIENTS,
  MAX_BROADCAST_TOTAL_BYTES,
  measurePayloadBytes,
} from './broadcast-guard'

describe('measurePayloadBytes', () => {
  it('soma bytes UTF-8 das partes, ignorando null/undefined', () => {
    expect(measurePayloadBytes(['abc', null, undefined, 'de'])).toBe(5)
  })

  it('conta multi-byte pelo tamanho real (não por caractere)', () => {
    // '🚀' = 4 bytes em UTF-8, 'ç' = 2.
    expect(measurePayloadBytes(['🚀ç'])).toBe(6)
  })

  it('mede não-string via JSON (metadata replicada também custa)', () => {
    expect(measurePayloadBytes([{ a: 1 }])).toBe(Buffer.byteLength('{"a":1}'))
  })
})

describe('checkBroadcastBudget', () => {
  it('permite difusão pequena', () => {
    const r = checkBroadcastBudget(10, ['título', 'mensagem curta'])
    expect(r.allowed).toBe(true)
    expect(r.totalBytes).toBe(r.payloadBytes * 10)
  })

  it('bloqueia acima do teto de destinatários mesmo com payload mínimo', () => {
    const r = checkBroadcastBudget(MAX_BROADCAST_RECIPIENTS + 1, ['x'])
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('too-many-recipients')
  })

  it('bloqueia quando payload × destinatários estoura o orçamento total', () => {
    // Cada cópia sob qualquer limite individual; 6 KB × 100 = 600 KB > 512 KB.
    const r = checkBroadcastBudget(100, ['a'.repeat(6 * 1024)])
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('budget-exceeded')
    expect(r.totalBytes).toBeGreaterThan(MAX_BROADCAST_TOTAL_BYTES)
  })

  it('o MESMO payload passa com poucos destinatários (o multiplicador decide)', () => {
    expect(checkBroadcastBudget(5, ['a'.repeat(6 * 1024)]).allowed).toBe(true)
  })

  it('aceita teto customizado via opts', () => {
    expect(checkBroadcastBudget(3, ['abcd'], { maxTotalBytes: 10 }).allowed).toBe(false)
    expect(checkBroadcastBudget(2, ['abcd'], { maxTotalBytes: 10 }).allowed).toBe(true)
  })

  it('zero destinatários é permitido (caller já faz early-return)', () => {
    expect(checkBroadcastBudget(0, ['x'.repeat(1024)]).allowed).toBe(true)
  })
})

describe('assertBroadcastBudget', () => {
  it('não lança dentro do orçamento', () => {
    expect(() => assertBroadcastBudget(10, ['ok'])).not.toThrow()
  })

  it('lança ValidationError (vira fail() amigável via runAction) ao estourar', () => {
    expect(() => assertBroadcastBudget(100, ['a'.repeat(6 * 1024)])).toThrow(ValidationError)
    expect(() => assertBroadcastBudget(MAX_BROADCAST_RECIPIENTS + 1, ['x'])).toThrow(
      ValidationError
    )
  })
})
