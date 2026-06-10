/**
 * Calcula uma posição fracionária entre dois vizinhos para inserir um item
 * em uma lista ordenada por `position: Float` sem renumerar.
 *
 * - Sem vizinhos: 1000 (ponto de partida convencional).
 * - Início da lista: `next - 1000`.
 * - Fim da lista: `prev + 1000`.
 * - Entre dois vizinhos: média aritmética (1.0 → 1.5 → 2.0...).
 *
 * Usado por dnd-kit em PipelineDeal e Lead — ambos guardam Float fracionário
 * exatamente para permitir essa inserção sem rebalancear.
 */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return 1000
  if (prev == null) return (next as number) - 1000
  if (next == null) return (prev as number) + 1000
  return (prev + next) / 2
}

/**
 * Detecta o ESGOTAMENTO de precisão da bissecção (Fase 4 do plano de correções):
 * após ~50 inserções entre os mesmos vizinhos, a média de floats deixa de
 * produzir um valor ESTRITAMENTE entre eles (vira igual a um dos dois) e a
 * ordenação fica indeterminada. Quando isto retorna true, o caller deve pedir
 * a renumeração da coluna no servidor (`rebalanceLeadAction`) em vez de
 * persistir a posição degenerada.
 */
export function isPositionExhausted(
  prev: number | null,
  next: number | null,
  position: number
): boolean {
  if (prev != null && position <= prev) return true
  if (next != null && position >= next) return true
  return false
}
