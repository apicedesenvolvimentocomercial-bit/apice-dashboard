import { describe, expect, it } from 'vitest'

import { positionBetween } from './dnd-position'

describe('lib/dnd-position', () => {
  describe('positionBetween', () => {
    it('lista vazia → ponto de partida 1000', () => {
      expect(positionBetween(null, null)).toBe(1000)
    })

    it('inserir no início (sem prev) → next - 1000', () => {
      expect(positionBetween(null, 500)).toBe(-500)
      expect(positionBetween(null, 1000)).toBe(0)
      expect(positionBetween(null, 2000)).toBe(1000)
    })

    it('inserir no fim (sem next) → prev + 1000', () => {
      expect(positionBetween(1000, null)).toBe(2000)
      expect(positionBetween(0, null)).toBe(1000)
      expect(positionBetween(-100, null)).toBe(900)
    })

    it('entre dois vizinhos → média aritmética', () => {
      expect(positionBetween(1000, 2000)).toBe(1500)
      expect(positionBetween(0, 1000)).toBe(500)
      expect(positionBetween(1, 2)).toBe(1.5)
    })

    it('subdivisões sucessivas geram floats fracionários sem colidir', () => {
      // Simula 5 inserções consecutivas entre 1.0 e 2.0:
      // 1.0 → 1.5 → 1.25 → 1.125 → 1.0625 → 1.03125
      let p1 = 1
      const p2 = 2
      const results: number[] = []
      for (let i = 0; i < 5; i++) {
        const mid = positionBetween(p1, p2)
        results.push(mid)
        p1 = mid
      }
      // Todos distintos e estritamente decrescentes (cada novo cai entre p1
      // e p2; como p2 fica fixo e p1 sobe a cada iteração, mid também sobe...
      // espera — corrigindo: como atualizamos p1 = mid, a nova média entre
      // (mid, 2) é maior que o mid anterior, então é estritamente crescente).
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeGreaterThan(results[i - 1])
        expect(results[i]).toBeLessThan(p2)
      }
    })

    it('aceita números negativos para prev', () => {
      expect(positionBetween(-1000, 0)).toBe(-500)
      expect(positionBetween(-2000, -1000)).toBe(-1500)
    })

    it('aceita zero como prev/next sem confundir com null', () => {
      // 0 é válido — não cai no branch null.
      expect(positionBetween(0, 1000)).toBe(500)
      expect(positionBetween(-1000, 0)).toBe(-500)
      expect(positionBetween(0, null)).toBe(1000)
      expect(positionBetween(null, 0)).toBe(-1000)
    })
  })
})
